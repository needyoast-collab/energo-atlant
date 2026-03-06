const { dbGet, dbRun, dbAll } = require('../config/database');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const { format } = require('date-fns');

// Функция-помощник для генерации кода (скопирована из helpers.js или будет импортирована)
// Так как мы не знаем где она сейчас, мы импортируем из helpers, если она там есть, 
// но давайте проверим utils/helpers.js на наличие нужных функций.
// Для простоты импортируем из helpers:
const { generateProjectCode, formatDateForDB, addHours, sendNotification, sendDirectNotification } = require('../utils/helpers');

// Настройка ИИ (openai)
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "EnergoAtlant Pro"
    }
});

exports.getStaff = async (req, res) => {
    try {
        const staff = await dbAll(
            "SELECT id, full_name, role FROM users WHERE role IN ('foreman', 'supplier', 'pto') AND is_active = 1"
        );
        res.json({ success: true, staff });
    } catch (error) {
        console.error('Ошибка получения персонала:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.createProject = async (req, res) => {
    try {
        const {
            title, address, description, clientName, clientOrganization,
            foremanId, supplierId, ptoId, customerId, requestId,
            work_type, length_m, lead_source, offer_sum, visit_date,
            offer_sent_date, offer_valid_until, contract_date,
            advance_sum, advance_date, act_date, final_sum
        } = req.body;

        if (!title || !address || !work_type || !length_m) {
            return res.status(400).json({ success: false, message: "Заполните все обязательные поля (Название, Адрес, Тип работ, Протяженность)" });
        }

        let accessCode;
        let codeExists = true;
        while (codeExists) {
            accessCode = generateProjectCode();
            const existing = await dbGet("SELECT id FROM projects WHERE access_code = ?", [accessCode]);
            codeExists = !!existing;
        }

        const stagesDeadline = formatDateForDB(addHours(new Date(), 72));

        const result = await dbRun(
            `INSERT INTO projects (
                title, address, description, client_name, client_organization, access_code, 
                status, stages_deadline, manager_id, foreman_id, supplier_id, pto_id, customer_id,
                work_type, length_m, lead_source, offer_sum, visit_date, offer_sent_date, 
                offer_valid_until, contract_date, advance_sum, advance_date, act_date, final_sum
             )
             VALUES (?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title, address, description, clientName, clientOrganization, accessCode,
                stagesDeadline, req.session.userId, foremanId || null, supplierId || null,
                ptoId || null, customerId || null,
                work_type, length_m || 0, lead_source || null,
                offer_sum ? parseFloat(offer_sum) : null, visit_date || null, offer_sent_date || null,
                offer_valid_until || null, contract_date || null, advance_sum ? parseFloat(advance_sum) : null,
                advance_date || null, act_date || null, final_sum ? parseFloat(final_sum) : null
            ]
        );

        const projectId = result.id;

        if (requestId) {
            // Переносим документы из заявки в проект
            const request = await dbGet("SELECT documents, customer_id FROM project_requests WHERE id = ?", [requestId]);
            if (request && request.documents) {
                const paths = request.documents.split(',');
                for (const p of paths) {
                    if (!p) continue;
                    const fileName = p.split('/').pop() || 'document';
                    await dbRun(
                        "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by) VALUES (?, 'initial', ?, ?, ?)",
                        [projectId, fileName, p, request.customer_id || req.session.userId]
                    );
                }
            }

            await dbRun(
                "UPDATE project_requests SET status = 'accepted', notes = 'Проект создан', reviewed_at = datetime('now'), project_id = ? WHERE id = ?",
                [projectId, requestId]
            );
        }

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await dbRun(
                    "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by) VALUES (?, 'initial', ?, ?, ?)",
                    [projectId, file.originalname, file.path, req.session.userId]
                );
            }
        }

        res.json({ success: true, projectId, accessCode, message: "Проект успешно создан" });

    } catch (error) {
        console.error('Ошибка создания проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.aiAnalyze = async (req, res) => {
    try {
        let filePath, originalName, mimeType;

        if (req.body.documentId) {
            const doc = await dbGet("SELECT file_path, file_name FROM project_documents WHERE id = ?", [req.body.documentId]);
            if (!doc) return res.status(404).json({ success: false, message: "Документ не найден" });

            filePath = path.join(__dirname, '..', doc.file_path);
            originalName = doc.file_name;
            mimeType = originalName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        } else if (req.file) {
            filePath = req.file.path;
            originalName = req.file.originalname;
            mimeType = req.file.mimetype;
        } else {
            return res.status(400).json({ success: false, message: "Файл не загружен или не выбран" });
        }

        const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const isPdf = mimeType === 'application/pdf';

        if (!isPdf && !validImageTypes.includes(mimeType)) {
            return res.status(400).json({ success: false, message: "ИИ поддерживает только изображения (JPG, PNG) и PDF" });
        }

        const prompt = `Ты - опытный инженер-сметчик и снабженец строительной компании. 
Твоя задача: изучить предоставленный файл (это может быть проектная документация, чертёж спецификации, смета или список).
Извлеки из него все строительно-монтажные работы (этапы работ) и все требуемые материалы.
Обязательно игнорируй любые цены и стоимости, нас интересуют только физические объёмы для закупки и проведения работ.

Верни ТОЛЬКО валидный JSON-объект, содержащий два массива ("works" и "materials"). Без лишнего текста, без markdown блоков! 
Пример формата:
{
  "works": [
    { "name": "Установка опор", "unit": "шт", "quantity": 10 }
  ],
  "materials": [
    { "name": "Опора железобетонная", "unit": "шт", "quantity": 10.5 }
  ]
}`;

        let apiMessages = [];

        if (isPdf) {
            const pdfData = await pdfParse(fs.readFileSync(filePath));
            const pdfText = pdfData.text.replace(/\s+/g, ' ').trim();

            if (!pdfText || pdfText.length < 10) {
                return res.status(400).json({ success: false, message: "Не удалось извлечь текст из PDF." });
            }

            apiMessages = [
                {
                    role: "user",
                    content: prompt + "\n\nВот текст документа для анализа:\n" + pdfText.substring(0, 15000)
                }
            ];
        } else {
            const fileData = fs.readFileSync(filePath);
            const base64Data = Buffer.from(fileData).toString("base64");
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            apiMessages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: dataUrl } }
                    ]
                }
            ];
        }

        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL || "openai/gpt-4o-mini",
            messages: apiMessages
        });

        let jsonText = response.choices[0].message.content.trim();

        if (jsonText.startsWith('\`\`\`json')) jsonText = jsonText.replace(/^\`\`\`json/, '');
        if (jsonText.startsWith('\`\`\`')) jsonText = jsonText.replace(/^\`\`\`/, '');
        if (jsonText.endsWith('\`\`\`')) jsonText = jsonText.replace(/\`\`\`$/, '');
        jsonText = jsonText.trim();

        let aiData;
        try {
            aiData = JSON.parse(jsonText);
        } catch (parseError) {
            return res.status(500).json({ success: false, message: "ИИ вернул ответ в неверном формате." });
        }

        res.json({ success: true, data: aiData });
    } catch (error) {
        console.error('Ошибка ИИ API:', error);
        res.status(500).json({ success: false, message: "Сбой на стороне нейросети (API)." });
    }
};

exports.applyAiEstimate = async (req, res) => {
    try {
        const { works, materials } = req.body;
        const projectId = req.params.id;

        const stageRes = await dbRun(
            "INSERT INTO project_stages (project_id, stage_number, name, description, created_by) VALUES (?, ?, ?, ?, ?)",
            [projectId, 1, "Основные работы (по смете ИИ)", "Сгенерировано нейросетью из загруженной документации", req.session.userId]
        );
        const stageId = stageRes.id;

        if (materials && materials.length > 0) {
            for (const mat of materials) {
                await dbRun(
                    "INSERT INTO project_materials (stage_id, material_name, unit, quantity_planned) VALUES (?, ?, ?, ?)",
                    [stageId, mat.name, mat.unit, mat.quantity]
                );
            }
        }

        res.json({ success: true, message: "Смета прикреплена к проекту" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getProjects = async (req, res) => {
    try {
        let query = `SELECT p.*, 
                    uf.full_name as foreman_name,
                    us.full_name as supplier_name,
                    up.full_name as pto_name,
                    uc.full_name as customer_name
             FROM projects p
             LEFT JOIN users uf ON p.foreman_id = uf.id
             LEFT JOIN users us ON p.supplier_id = us.id
             LEFT JOIN users up ON p.pto_id = up.id
             LEFT JOIN users uc ON p.customer_id = uc.id`;

        let params = [];

        // Если не админ - фильтруем по менеджеру
        if (req.session.userRole !== 'admin') {
            query += " WHERE p.manager_id = ?";
            params.push(req.session.userId);
        }

        query += " ORDER BY p.created_at DESC";

        const projects = await dbAll(query, params);
        res.json({ success: true, projects });
    } catch (error) {
        console.error('getProjects error:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.updateProject = async (req, res) => {
    try {
        const {
            title, address, description, clientName, clientOrganization,
            foremanId, supplierId, ptoId, status,
            work_type, length_m, lead_source, offer_sum, visit_date,
            offer_sent_date, offer_valid_until, contract_date,
            advance_sum, advance_date, act_date, final_sum
        } = req.body;

        // Получаем старый статус и customer_id перед обновлением для уведомлений
        const oldProject = await dbGet("SELECT status, customer_id, title FROM projects WHERE id = ?", [req.params.id]);

        let query = `UPDATE projects SET title = ?, address = ?, description = ?, client_name = ?, 
                     client_organization = ?, foreman_id = ?, supplier_id = ?, pto_id = ?, status = ?,
                     work_type = ?, length_m = ?, lead_source = ?, offer_sum = ?, visit_date = ?, 
                     offer_sent_date = ?, offer_valid_until = ?, contract_date = ?, advance_sum = ?, 
                     advance_date = ?, act_date = ?, final_sum = ?
                     WHERE id = ?`;
        let params = [
            title, address, description, clientName, clientOrganization, foremanId, supplierId, ptoId, status,
            work_type, length_m, lead_source, offer_sum, visit_date, offer_sent_date, offer_valid_until,
            contract_date, advance_sum, advance_date, act_date, final_sum, req.params.id
        ];

        if (req.session.userRole !== 'admin') {
            query += " AND manager_id = ?";
            params.push(req.session.userId);
        }

        const runResult = await dbRun(query, params);

        // Если обновилось хотя бы 1 поле и статус изменился + есть привязанный заказчик
        if (runResult.changes > 0 && oldProject && oldProject.status !== status && oldProject.customer_id) {
            const customerStatusLabels = {
                'lead': 'Заявка принята',
                'qualification': 'Уточняем детали объекта',
                'visit_scheduled': 'Выезд на объект запланирован',
                'offer_in_progress': 'Готовим коммерческое предложение',
                'offer_sent': 'Коммерческое предложение направлено',
                'negotiation': 'Согласование условий',
                'contract_signing': 'Договор на подписании',
                'waiting_advance': 'Ожидаем аванс для старта работ',
                'in_progress': 'Работы выполняются',
                'closing_docs': 'Оформление документации',
                'won': 'Объект сдан',
                'lost': 'Отменён',
                'postponed': 'Рассмотрение приостановлено'
            };

            const newLabel = customerStatusLabels[status] || status;
            await dbRun(
                `INSERT INTO notifications (user_id, project_id, type, message) VALUES (?, ?, 'status_change', ?)`,
                [oldProject.customer_id, req.params.id, `Статус объекта «${oldProject.title}» изменён: ${newLabel}`]
            );
        }

        res.json({ success: true, message: "Проект обновлен" });
    } catch (error) {
        console.error('updateProject error:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.completeProject = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Необходимо загрузить скан-копию Акта выполненных работ" });
        }

        const smsCode = req.body.smsCode;
        if (!smsCode || smsCode.length < 4) {
            return res.status(400).json({ success: false, message: "Необходим корректный СМС-код от заказчика" });
        }

        const projectId = req.params.id;

        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'act', ?, ?, ?, ?)",
            [projectId, req.file.originalname, req.file.path, req.session.userId, `Акт выполненных работ (Подписан по СМС: ${smsCode})`]
        );

        let query = "UPDATE projects SET status = 'won' WHERE id = ?";
        let params = [projectId];

        if (req.session.userRole !== 'admin') {
            query += " AND manager_id = ?";
            params.push(req.session.userId);
        }

        await dbRun(query, params);

        res.json({ success: true, message: "Проект успешно завершен, Акт подписан по СМС и загружен" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getProjectDocuments = async (req, res) => {
    try {
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC",
            [req.params.id]
        );
        res.json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.uploadProjectDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Файл не выбран" });

        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, req.body.docType || 'other', req.file.originalname, req.file.path, req.session.userId, req.body.description || '']
        );

        // Уведомляем участников проекта (нужно прокинуть sendNotification или вызывать его по-другому, если он в helpers)
        sendNotification(req.params.id, 'document', `Загружен новый документ: ${req.file.originalname}`);

        res.json({ success: true, message: "Документ загружен" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getRequests = async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT pr.id, pr.title, pr.description, pr.documents, pr.contact_info, pr.status, pr.created_at, 
                    u.full_name as customer_name, u.email, u.phone, 'authenticated' as request_type
             FROM project_requests pr
             JOIN users u ON pr.customer_id = u.id
             WHERE pr.status = 'pending'
             
             UNION ALL
             
             SELECT id, organization as title, description, documents, NULL as contact_info, status, created_at,
                    full_name as customer_name, email, phone, 'public' as request_type
             FROM public_requests
             WHERE status = 'pending'
             
             ORDER BY created_at DESC`
        );
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getRequestArchive = async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT pr.id, pr.title, pr.description, pr.status, pr.created_at, pr.reviewed_at, pr.notes,
                    u.full_name as customer_name, u.email, u.phone, 'authenticated' as request_type
             FROM project_requests pr
             JOIN users u ON pr.customer_id = u.id
             WHERE pr.status IN ('accepted', 'rejected', 'reviewed')
             
             UNION ALL
             
             SELECT id, organization as title, description, status, created_at, reviewed_at, notes,
                    full_name as customer_name, email, phone, 'public' as request_type
             FROM public_requests
             WHERE status IN ('accepted', 'rejected', 'reviewed')
             
             ORDER BY reviewed_at DESC`
        );
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.reviewRequest = async (req, res) => {
    try {
        const { status, notes, requestType } = req.body;

        if (requestType === 'public') {
            await dbRun(
                "UPDATE public_requests SET status = ?, notes = ?, reviewed_at = datetime('now') WHERE id = ?",
                [status, notes, req.params.id]
            );
        } else {
            await dbRun(
                "UPDATE project_requests SET status = ?, notes = ?, reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?",
                [status, notes, req.session.userId, req.params.id]
            );
        }

        res.json({ success: true, message: "Заявка обработана" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
