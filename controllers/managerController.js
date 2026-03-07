const { dbGet, dbRun, dbAll } = require('../config/database');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const { format } = require('date-fns');
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

const { z } = require('zod');

// Схемы валидации Zod
const projectSchema = z.object({
    title: z.string().min(3, "Название слишком короткое").max(200),
    address: z.string().min(5, "Адрес слишком короткий").max(300),
    description: z.string().max(1000).optional().or(z.literal('')),
    clientName: z.string().max(100).optional().or(z.literal('')),
    clientOrganization: z.string().max(100).optional().or(z.literal('')),
    foremanId: z.number().int().positive().optional().nullable(),
    supplierId: z.number().int().positive().optional().nullable(),
    ptoId: z.number().int().positive().optional().nullable(),
    customerId: z.number().int().positive().optional().nullable(),
    requestId: z.number().int().positive().optional().nullable(),
    work_type: z.string().min(2, "Укажите тип работ").max(200),
    length_m: z.coerce.number().min(0, "Протяженность не может быть отрицательной"),
    lead_source: z.string().max(100).optional().nullable(),
    offer_sum: z.coerce.number().optional().nullable(),
    visit_date: z.string().datetime().optional().nullable().or(z.literal('')),
    offer_sent_date: z.string().date().optional().nullable().or(z.literal('')),
    offer_valid_until: z.string().date().optional().nullable().or(z.literal('')),
    contract_date: z.string().date().optional().nullable().or(z.literal('')),
    advance_sum: z.coerce.number().optional().nullable(),
    advance_date: z.string().date().optional().nullable().or(z.literal('')),
    act_date: z.string().date().optional().nullable().or(z.literal('')),
    final_sum: z.coerce.number().optional().nullable(),
    status: z.string().optional().default('lead')
});

exports.getStaff = async (req, res, next) => {
    try {
        const staff = await dbAll(
            "SELECT id, full_name, role FROM users WHERE role IN ('foreman', 'supplier', 'pto') AND is_active = 1"
        );
        res.json({ success: true, staff });
    } catch (error) {
        next(error);
    }
};

exports.createProject = async (req, res, next) => {
    try {
        const parseResult = projectSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
        }

        const data = parseResult.data;
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
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.title, data.address, data.description || null, data.clientName || null,
                data.clientOrganization || null, accessCode, data.status || 'lead',
                stagesDeadline, req.session.userId, data.foremanId || null,
                data.supplierId || null, data.ptoId || null, data.customerId || null,
                data.work_type, data.length_m || 0, data.lead_source || null,
                data.offer_sum || null, data.visit_date || null, data.offer_sent_date || null,
                data.offer_valid_until || null, data.contract_date || null,
                data.advance_sum || null, data.advance_date || null, data.act_date || null,
                data.final_sum || null
            ]
        );

        const projectId = result.id;

        if (data.requestId) {
            const request = await dbGet("SELECT documents, customer_id FROM project_requests WHERE id = ?", [data.requestId]);
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
                [projectId, data.requestId]
            );
        }

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                await dbRun(
                    "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by) VALUES (?, 'initial', ?, ?, ?)",
                    [projectId, fileName, file.path, req.session.userId]
                );
            }
        }

        res.json({ success: true, projectId, accessCode, message: "Проект успешно создан" });
    } catch (error) {
        next(error);
    }
};

exports.aiAnalyze = async (req, res, next) => {
    try {
        let filePath, originalName, mimeType;

        if (req.body.documentId) {
            const documentId = z.coerce.number().parse(req.body.documentId);
            const doc = await dbGet(`
                SELECT pd.file_path, pd.file_name, p.manager_id 
                FROM project_documents pd
                JOIN projects p ON pd.project_id = p.id
                WHERE pd.id = ?
            `, [documentId]);

            if (!doc) return res.status(404).json({ success: false, message: "Документ не найден" });

            // Проверка прав (IDOR)
            if (req.session.userRole !== 'admin' && doc.manager_id !== req.session.userId) {
                return res.status(403).json({ success: false, message: "Нет доступа к этому документу" });
            }

            filePath = path.join(process.cwd(), doc.file_path);
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
Извлеки строительно-монтажные работы и материалы из документа (без цен). 
Верни ТОЛЬКО валидный JSON-объект: { "works": [...], "materials": [...] }`;

        let apiMessages = [];
        if (isPdf) {
            const pdfData = await pdfParse(fs.readFileSync(filePath));
            const pdfText = pdfData.text.replace(/\s+/g, ' ').trim();
            if (!pdfText || pdfText.length < 10) {
                return res.status(400).json({ success: false, message: "Не удалось извлечь текст из PDF." });
            }
            apiMessages = [{ role: "user", content: prompt + "\n\nТекст:\n" + pdfText.substring(0, 15000) }];
        } else {
            const fileData = fs.readFileSync(filePath);
            const dataUrl = `data:${mimeType};base64,${fileData.toString("base64")}`;
            apiMessages = [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }];
        }

        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL || "openai/gpt-4o-mini",
            messages: apiMessages
        });

        let jsonText = response.choices[0].message.content.trim();
        jsonText = jsonText.replace(/^\`\`\`json/i, '').replace(/\`\`\`$/i, '').trim();

        const aiData = JSON.parse(jsonText);
        res.json({ success: true, data: aiData });
    } catch (error) {
        next(error);
    }
};

exports.applyAiEstimate = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const { works, materials } = req.body;

        // Проверка прав (IDOR)
        const project = await dbGet("SELECT id FROM projects WHERE id = ? AND (manager_id = ? OR ? = 'admin')",
            [projectId, req.session.userId, req.session.userRole]);
        if (!project) return res.status(403).json({ success: false, message: "Нет доступа к проекту" });

        const stageRes = await dbRun(
            "INSERT INTO project_stages (project_id, stage_number, name, description, created_by) VALUES (?, ?, ?, ?, ?)",
            [projectId, 1, "Основные работы (по смете ИИ)", "Сгенерировано нейросетью", req.session.userId]
        );
        const stageId = stageRes.id;

        if (Array.isArray(materials)) {
            for (const mat of materials) {
                if (mat.name) {
                    await dbRun(
                        "INSERT INTO project_materials (stage_id, material_name, unit, quantity_planned) VALUES (?, ?, ?, ?)",
                        [stageId, mat.name, mat.unit || 'шт', mat.quantity || 0]
                    );
                }
            }
        }

        res.json({ success: true, message: "Смета прикреплена к проекту" });
    } catch (error) {
        next(error);
    }
};

exports.getProjects = async (req, res, next) => {
    try {
        let query = `SELECT p.*, uf.full_name as foreman_name, us.full_name as supplier_name,
                            up.full_name as pto_name, uc.full_name as customer_name
                     FROM projects p
                     LEFT JOIN users uf ON p.foreman_id = uf.id
                     LEFT JOIN users us ON p.supplier_id = us.id
                     LEFT JOIN users up ON p.pto_id = up.id
                     LEFT JOIN users uc ON p.customer_id = uc.id`;
        const params = [];

        if (req.session.userRole !== 'admin') {
            query += " WHERE p.manager_id = ?";
            params.push(req.session.userId);
        }

        query += " ORDER BY p.created_at DESC";
        const projects = await dbAll(query, params);
        res.json({ success: true, projects });
    } catch (error) {
        next(error);
    }
};

exports.updateProject = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const parseResult = projectSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
        }

        const data = parseResult.data;
        const oldProject = await dbGet("SELECT status, customer_id, title, manager_id FROM projects WHERE id = ?", [projectId]);

        if (!oldProject) return res.status(404).json({ success: false, message: "Проект не найден" });

        // IDOR check
        if (req.session.userRole !== 'admin' && oldProject.manager_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: "Нет прав на редактирование этого проекта" });
        }

        await dbRun(
            `UPDATE projects SET 
                title = ?, address = ?, description = ?, client_name = ?, client_organization = ?, 
                foreman_id = ?, supplier_id = ?, pto_id = ?, status = ?, work_type = ?, 
                length_m = ?, lead_source = ?, offer_sum = ?, visit_date = ?, offer_sent_date = ?, 
                offer_valid_until = ?, contract_date = ?, advance_sum = ?, advance_date = ?, 
                act_date = ?, final_sum = ?
            WHERE id = ?`,
            [
                data.title, data.address, data.description || null, data.clientName || null, data.clientOrganization || null,
                data.foremanId || null, data.supplierId || null, data.ptoId || null, data.status, data.work_type,
                data.length_m, data.lead_source || null, data.offer_sum || null, data.visit_date || null,
                data.offer_sent_date || null, data.offer_valid_until || null, data.contract_date || null,
                data.advance_sum || null, data.advance_date || null, data.act_date || null, data.final_sum || null,
                projectId
            ]
        );

        if (oldProject.status !== data.status && oldProject.customer_id) {
            const labels = { 'lead': 'Заявка принята', 'in_progress': 'Работы выполняются', 'won': 'Объект сдан' };
            const label = labels[data.status] || data.status;
            await dbRun(
                `INSERT INTO notifications (user_id, project_id, type, message) VALUES (?, ?, 'status_change', ?)`,
                [oldProject.customer_id, projectId, `Статус объекта «${oldProject.title}» изменён: ${label}`]
            );
        }

        res.json({ success: true, message: "Проект обновлен" });
    } catch (error) {
        next(error);
    }
};

exports.completeProject = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        if (!req.file) return res.status(400).json({ success: false, message: "Загрузите Акт" });

        const smsCode = z.string().min(4).parse(req.body.smsCode);
        const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        // Check ownership
        const project = await dbGet("SELECT id FROM projects WHERE id = ? AND (manager_id = ? OR ? = 'admin')",
            [projectId, req.session.userId, req.session.userRole]);
        if (!project) return res.status(403).json({ success: false, message: "Нет доступа" });

        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'act', ?, ?, ?, ?)",
            [projectId, fileName, req.file.path, req.session.userId, `Подписан по СМС: ${smsCode}`]
        );

        await dbRun("UPDATE projects SET status = 'won' WHERE id = ?", [projectId]);
        res.json({ success: true, message: "Проект успешно завершен" });
    } catch (error) {
        next(error);
    }
};

exports.getProjectDocuments = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const project = await dbGet("SELECT id FROM projects WHERE id = ? AND (manager_id = ? OR ? = 'admin')",
            [projectId, req.session.userId, req.session.userRole]);
        if (!project) return res.status(403).json({ success: false, message: "Нет доступа" });

        const documents = await dbAll("SELECT * FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC", [projectId]);
        res.json({ success: true, documents });
    } catch (error) {
        next(error);
    }
};

exports.uploadProjectDocument = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        if (!req.file) return res.status(400).json({ success: false, message: "Файл не выбран" });

        const project = await dbGet("SELECT id FROM projects WHERE id = ? AND (manager_id = ? OR ? = 'admin')",
            [projectId, req.session.userId, req.session.userRole]);
        if (!project) return res.status(403).json({ success: false, message: "Нет доступа" });

        const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, ?, ?, ?, ?, ?)",
            [projectId, req.body.docType || 'other', fileName, req.file.path, req.session.userId, req.body.description || '']
        );

        sendNotification(projectId, 'document', `Загружен новый документ: ${fileName}`);
        res.json({ success: true, message: "Документ загружен" });
    } catch (error) {
        next(error);
    }
};

exports.getRequests = async (req, res, next) => {
    try {
        const requests = await dbAll(`
            SELECT pr.id, pr.title, pr.description, pr.documents, pr.contact_info, pr.status, pr.created_at, 
                   u.full_name as customer_name, u.email, u.phone, 'authenticated' as request_type
            FROM project_requests pr JOIN users u ON pr.customer_id = u.id WHERE pr.status = 'pending'
            UNION ALL
            SELECT id, organization as title, description, documents, NULL as contact_info, status, created_at,
                   full_name as customer_name, email, phone, 'public' as request_type
            FROM public_requests WHERE status = 'pending'
            ORDER BY created_at DESC
        `);
        res.json({ success: true, requests });
    } catch (error) {
        next(error);
    }
};

exports.getRequestArchive = async (req, res, next) => {
    try {
        const requests = await dbAll(`
            SELECT pr.id, pr.title, pr.description, pr.status, pr.created_at, pr.reviewed_at, pr.notes,
                   u.full_name as customer_name, u.email, u.phone, 'authenticated' as request_type
            FROM project_requests pr JOIN users u ON pr.customer_id = u.id 
            WHERE pr.status IN ('accepted', 'rejected', 'reviewed')
            UNION ALL
            SELECT id, organization as title, description, status, created_at, reviewed_at, notes,
                   full_name as customer_name, email, phone, 'public' as request_type
            FROM public_requests WHERE status IN ('accepted', 'rejected', 'reviewed')
            ORDER BY reviewed_at DESC
        `);
        res.json({ success: true, requests });
    } catch (error) {
        next(error);
    }
};

exports.reviewRequest = async (req, res, next) => {
    try {
        const requestId = z.coerce.number().parse(req.params.id);
        const { status, notes, requestType } = req.body;

        if (requestType === 'public') {
            await dbRun("UPDATE public_requests SET status = ?, notes = ?, reviewed_at = datetime('now') WHERE id = ?", [status, notes, requestId]);
        } else {
            await dbRun("UPDATE project_requests SET status = ?, notes = ?, reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?", [status, notes, req.session.userId, requestId]);
        }
        res.json({ success: true, message: "Заявка обработана" });
    } catch (error) {
        next(error);
    }
};
