require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const XLSX = require('xlsx');
const { OpenAI } = require("openai");

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "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"
});

const {
    requireAuth,
    requireManagerOrAdmin,
    requireForeman,
    requireSupplier,
    requirePTO,
    requireCustomer
} = require('./middleware/auth');

const {
    generateProjectCode,
    addHours,
    formatDateForDB,
    isDeadlinePassed,
    sanitizeUser
} = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКА БАЗЫ ДАННЫХ ===
const db = new sqlite3.Database(process.env.DB_PATH || './energo.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
        process.exit(1);
    }
    console.log('💾 База данных подключена');
});

// Промисификация запросов к БД
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Rate limiting для защиты от брутфорса
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000, // Много попыток для разработки
    skipSuccessfulRequests: true, // НЕ считать успешные попытки
    message: { success: false, message: "Слишком много попыток входа. Попробуйте позже." }
});

// === НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ===
// Создаем папку uploads если её нет
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Создана папка uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeName = `${Date.now()}-${file.originalname}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
        files: 20 // Максимум 20 файлов
    },
    fileFilter: (req, file, cb) => {
        console.log(`📎 Загружается файл: ${file.originalname}`);
        cb(null, true);
    }
});

// Раздача статики
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === РОУТИНГ ПО РОЛЯМ ===
app.get('/dashboard', requireAuth, (req, res) => {
    const role = req.session.userRole;
    const dashboards = {
        'admin': 'dashboard_admin.html',
        'manager': 'dashboard_manager.html',
        'foreman': 'dashboard_foreman.html',
        'supplier': 'dashboard_supplier.html',
        'pto': 'dashboard_pto.html',
        'customer': 'dashboard_customer.html',
        'partner': 'dashboard_partner.html'
    };

    const file = dashboards[role] || 'dashboard_customer.html';
    res.sendFile(path.join(__dirname, 'public', file));
});

// ============================================================
// АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ
// ============================================================

// Вход в систему (С ИСПРАВЛЕНИЕМ ПАРОЛЕЙ)
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                success: false,
                message: "Заполните все поля"
            });
        }

        // Поиск по логину, email или телефону
        const user = await dbGet(
            "SELECT * FROM users WHERE (login = ? OR email = ? OR phone = ?) AND is_active = 1",
            [login, login, login]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // === НАЧАЛО ИЗМЕНЕНИЙ: ГИБРИДНАЯ ПРОВЕРКА ===
        let passwordMatch = false;

        // 1. Проверяем, совпадает ли пароль как обычный текст (для тестовых юзеров)
        if (user.password === password) {
            passwordMatch = true;
        }
        // 2. Если нет, проверяем как хеш (bcrypt)
        else {
            passwordMatch = await bcrypt.compare(password, user.password);
        }
        // === КОНЕЦ ИЗМЕНЕНИЙ ===

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль"
            });
        }

        // Сохранение сессии
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userName = user.full_name;
        req.session.userLogin = user.login;

        console.log(`✅ Вход выполнен: ${user.login} (${user.role})`);

        res.json({
            success: true,
            role: user.role,
            user: sanitizeUser(user)
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});
// Выход (GET для совместимости)
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});
// Регистрация (только для заказчиков)
app.post('/api/register', async (req, res) => {
    try {
        const { login, password, email, phone, fullName, organization } = req.body;

        // Валидация
        if (!login || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: "Заполните обязательные поля"
            });
        }

        // Проверка существования
        const existing = await dbGet(
            "SELECT id FROM users WHERE login = ? OR email = ? OR phone = ?",
            [login, email, phone]
        );

        if (existing) {
            return res.json({
                success: false,
                message: "Пользователь с такими данными уже существует"
            });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание пользователя
        await dbRun(
            "INSERT INTO users (login, password, email, phone, full_name, organization, role) VALUES (?, ?, ?, ?, ?, ?, 'customer')",
            [login, hashedPassword, email, phone, fullName, organization]
        );

        console.log(`✅ Регистрация: ${login}`);

        res.json({ success: true, message: "Регистрация успешна" });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// Получение данных текущего пользователя
app.get('/api/user/me', requireAuth, async (req, res) => {
    try {
        const user = await dbGet(
            "SELECT id, login, email, phone, role, full_name, organization FROM users WHERE id = ?",
            [req.session.userId]
        );

        res.json({ success: true, user });
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// API ДЛЯ АДМИНИСТРАТОРА
// ============================================================

// Middleware для проверки прав администратора
const requireAdmin = (req, res, next) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: "Доступ запрещен. Только для администраторов." });
    }
    next();
};

// Получение списка всех пользователей
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await dbAll(
            "SELECT id, login, email, phone, role, full_name, organization, is_active, created_at FROM users ORDER BY id DESC"
        );
        res.json({ success: true, users });
    } catch (error) {
        console.error('Ошибка получения списка пользователей:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Создание нового пользователя администратором
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { login, password, email, phone, role, full_name, organization } = req.body;

        if (!login || !password || !full_name || !role) {
            return res.status(400).json({ success: false, message: "Заполните обязательные поля" });
        }

        const existingUser = await dbGet("SELECT id FROM users WHERE login = ?", [login]);
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Пользователь с таким логином уже существует" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await dbRun(
            `INSERT INTO users (login, password, email, phone, role, full_name, organization) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [login, hashedPassword, email || null, phone || null, role, full_name, organization || null]
        );

        res.json({ success: true, message: "Пользователь успешно создан" });
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Редактирование пользователя
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { full_name, role, is_active } = req.body;

        if (!full_name || !role) {
            return res.status(400).json({ success: false, message: "Заполните обязательные поля ФИО и Роль" });
        }

        // Если передали пароль (необязательно, можно добавить позже. Сейчас только ФИО, Роль, is_active)
        await dbRun(
            "UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?",
            [full_name, role, is_active !== undefined ? is_active : 1, userId]
        );

        res.json({ success: true, message: "Данные пользователя обновлены" });
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// API ДЛЯ МЕНЕДЖЕРА
// ============================================================

// Получение списка сотрудников для назначения
app.get('/api/manager/staff', requireManagerOrAdmin, async (req, res) => {
    try {
        const staff = await dbAll(
            "SELECT id, full_name, role FROM users WHERE role IN ('foreman', 'supplier', 'pto') AND is_active = 1"
        );

        res.json({ success: true, staff });
    } catch (error) {
        console.error('Ошибка получения персонала:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Создание проекта менеджером
// Создание проекта менеджером (ОБНОВЛЕННЫЙ)
app.post('/api/manager/projects', requireManagerOrAdmin, upload.array('documents', 10), async (req, res) => {
    try {
        // Добавили customerId и requestId
        const { title, address, description, clientName, clientOrganization, foremanId, supplierId, ptoId, customerId, requestId } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: "Укажите название проекта" });
        }

        // Генерация кода
        let accessCode;
        let codeExists = true;
        while (codeExists) {
            accessCode = generateProjectCode();
            const existing = await dbGet("SELECT id FROM projects WHERE access_code = ?", [accessCode]);
            codeExists = !!existing;
        }

        const stagesDeadline = formatDateForDB(addHours(new Date(), 72));

        // 1. Создаем проект (Сразу прописываем customer_id, если он пришел)
        const result = await dbRun(
            `INSERT INTO projects (title, address, description, client_name, client_organization, access_code, 
             status, stages_deadline, manager_id, foreman_id, supplier_id, pto_id, customer_id)
             VALUES (?, ?, ?, ?, ?, ?, 'stages_pending', ?, ?, ?, ?, ?, ?)`,
            [title, address, description, clientName, clientOrganization, accessCode, stagesDeadline,
                req.session.userId, foremanId || null, supplierId || null, ptoId || null, customerId || null]
        );

        const projectId = result.id;

        // 2. Если проект создан на основе заявки -> обновляем статус заявки и связываем её
        if (requestId) {
            await dbRun(
                "UPDATE project_requests SET status = 'accepted', notes = 'Проект создан', reviewed_at = datetime('now'), project_id = ? WHERE id = ?",
                [projectId, requestId]
            );
        }

        // 3. Сохранение документов
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await dbRun(
                    "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by) VALUES (?, 'initial', ?, ?, ?)",
                    [projectId, file.originalname, file.path, req.session.userId]
                );
            }
        }

        console.log(`✅ Проект создан: ${title} (${accessCode}). Заказчик ID: ${customerId || 'нет'}`);

        res.json({
            success: true,
            projectId,
            accessCode,
            message: "Проект успешно создан"
        });

    } catch (error) {
        console.error('Ошибка создания проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// ИИ: АНАЛИЗ ВОМ И ВОР
// ============================================================
app.post('/api/manager/ai-analyze', requireManagerOrAdmin, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Файл не загружен" });

        console.log(`[ИИ] Нейросеть OpenRouter анализирует файл: ${req.file.originalname}`);

        const mimeType = req.file.mimetype;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (mimeType === 'application/pdf') {
            return res.status(400).json({ success: false, message: "Пожалуйста, загрузите картинку (JPG/PNG). OpenRouter временно не принимает PDF напрямую." });
        }
        if (!validTypes.includes(mimeType)) {
            return res.status(400).json({ success: false, message: "ИИ поддерживает только изображения (JPG, PNG)" });
        }

        // Читаем файл в base64
        const fileData = fs.readFileSync(req.file.path);
        const base64Data = Buffer.from(fileData).toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64Data}`;

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

        const response = await openai.chat.completions.create({
            model: "google/gemma-3-27b-it:free",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: dataUrl } }
                    ]
                }
            ]
        });

        let jsonText = response.choices[0].message.content.trim();

        // Очищаем от возможных markdown тегов, которые любит добавлять нейросеть
        if (jsonText.startsWith('\`\`\`json')) jsonText = jsonText.replace(/^\`\`\`json/, '');
        if (jsonText.startsWith('\`\`\`')) jsonText = jsonText.replace(/^\`\`\`/, '');
        if (jsonText.endsWith('\`\`\`')) jsonText = jsonText.replace(/\`\`\`$/, '');
        jsonText = jsonText.trim();

        let aiData;
        try {
            aiData = JSON.parse(jsonText);
        } catch (parseError) {
            console.error("Не удалось распарсить JSON от ИИ:", jsonText);
            return res.status(500).json({ success: false, message: "ИИ вернул ответ в неверном формате. Попробуйте снова." });
        }

        res.json({
            success: true,
            data: aiData
        });

    } catch (error) {
        console.error('Ошибка ИИ API:', error);
        res.status(500).json({ success: false, message: "Сбой на стороне нейросети (API). Убедитесь, что размер файла не превышает лимиты." });
    }
});

app.post('/api/manager/projects/:id/apply-ai-estimate', requireManagerOrAdmin, async (req, res) => {
    try {
        const { works, materials } = req.body;
        const projectId = req.params.id;

        // 1. Создаем один общий этап работ (или несколько)
        const stageRes = await dbRun(
            "INSERT INTO project_stages (project_id, stage_number, name, description, created_by) VALUES (?, ?, ?, ?, ?)",
            [projectId, 1, "Основные работы (по смете ИИ)", "Сгенерировано нейросетью из загруженной документации", req.session.userId]
        );
        const stageId = stageRes.id;

        // 2. Вставляем все материалы с привязкой к этому этапу
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
        console.error('Ошибка сохранения ИИ сметы:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение проектов менеджера
app.get('/api/manager/projects', requireManagerOrAdmin, async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, 
                    uf.full_name as foreman_name,
                    us.full_name as supplier_name,
                    up.full_name as pto_name,
                    uc.full_name as customer_name
             FROM projects p
             LEFT JOIN users uf ON p.foreman_id = uf.id
             LEFT JOIN users us ON p.supplier_id = us.id
             LEFT JOIN users up ON p.pto_id = up.id
             LEFT JOIN users uc ON p.customer_id = uc.id
             WHERE p.manager_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Обновление проекта
app.put('/api/manager/projects/:id', requireManagerOrAdmin, async (req, res) => {
    try {
        const { title, address, description, clientName, clientOrganization, foremanId, supplierId, ptoId, status } = req.body;

        await dbRun(
            `UPDATE projects SET title = ?, address = ?, description = ?, client_name = ?, 
             client_organization = ?, foreman_id = ?, supplier_id = ?, pto_id = ?, status = ?
             WHERE id = ? AND manager_id = ?`,
            [title, address, description, clientName, clientOrganization, foremanId, supplierId, ptoId, status,
                req.params.id, req.session.userId]
        );

        res.json({ success: true, message: "Проект обновлен" });
    } catch (error) {
        console.error('Ошибка обновления проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Завершение проекта (загрузка Акта + SMS подписание)
app.put('/api/manager/projects/:id/complete', requireManagerOrAdmin, upload.single('act'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Необходимо загрузить скан-копию Акта выполненных работ" });
        }

        const smsCode = req.body.smsCode;
        if (!smsCode || smsCode.length < 4) {
            return res.status(400).json({ success: false, message: "Необходим корректный СМС-код от заказчика" });
        }

        const projectId = req.params.id;

        // 1. Сохраняем Акт (указываем что подписан по смс)
        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'act', ?, ?, ?, ?)",
            [projectId, req.file.originalname, req.file.path, req.session.userId, `Акт выполненных работ (Подписан по СМС: ${smsCode})`]
        );

        // 2. Закрываем проект
        await dbRun(
            "UPDATE projects SET status = 'completed' WHERE id = ? AND manager_id = ?",
            [projectId, req.session.userId]
        );

        res.json({ success: true, message: "Проект успешно завершен, Акт подписан по СМС и загружен" });
    } catch (error) {
        console.error('Ошибка завершения проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получить документы проекта для менеджера
app.get('/api/manager/projects/:id/documents', requireManagerOrAdmin, async (req, res) => {
    try {
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC",
            [req.params.id]
        );
        res.json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Загрузить новый документ (договор, РД и т.д.)
app.post('/api/manager/projects/:id/documents', requireManagerOrAdmin, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Файл не выбран" });

        await dbRun(
            "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, req.body.docType || 'other', req.file.originalname, req.file.path, req.session.userId, req.body.description || '']
        );
        res.json({ success: true, message: "Документ загружен" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Просмотр заявок от клиентов
app.get('/api/manager/requests', requireManagerOrAdmin, async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT pr.*, u.full_name as customer_name, u.email, u.phone
             FROM project_requests pr
             JOIN users u ON pr.customer_id = u.id
             WHERE pr.status = 'pending'
             ORDER BY pr.created_at DESC`
        );

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Рассмотрение заявки
app.put('/api/manager/requests/:id', requireManagerOrAdmin, async (req, res) => {
    try {
        const { status, notes } = req.body; // status: 'reviewed', 'accepted', 'rejected'

        await dbRun(
            "UPDATE project_requests SET status = ?, notes = ?, reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?",
            [status, notes, req.session.userId, req.params.id]
        );

        res.json({ success: true, message: "Заявка обработана" });
    } catch (error) {
        console.error('Ошибка обработки заявки:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// API ДЛЯ ПРОРАБА
// ============================================================

// Присоединение к проекту по коду
app.post('/api/foreman/join', requireForeman, async (req, res) => {
    try {
        const { accessCode } = req.body;

        if (!accessCode) {
            return res.status(400).json({
                success: false,
                message: "Введите код проекта"
            });
        }

        const project = await dbGet(
            "SELECT * FROM projects WHERE access_code = ?",
            [accessCode]
        );

        if (!project) {
            return res.json({
                success: false,
                message: "Проект с таким кодом не найден"
            });
        }

        // Проверка, не истек ли срок создания этапов
        if (project.foreman_id && project.foreman_id !== req.session.userId) {
            return res.json({
                success: false,
                message: "К этому проекту уже привязан другой прораб"
            });
        }

        // Привязка прораба
        await dbRun(
            "UPDATE projects SET foreman_id = ? WHERE id = ?",
            [req.session.userId, project.id]
        );

        console.log(`✅ Прораб ${req.session.userName} присоединился к проекту ${project.title}`);

        res.json({
            success: true,
            project: {
                id: project.id,
                title: project.title,
                address: project.address
            }
        });

    } catch (error) {
        console.error('Ошибка присоединения к проекту:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение проектов прораба
app.get('/api/foreman/projects', requireForeman, async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, 
                    um.full_name as manager_name,
                    us.full_name as supplier_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users us ON p.supplier_id = us.id
             WHERE p.foreman_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение деталей проекта с этапами
app.get('/api/foreman/projects/:id', requireForeman, async (req, res) => {
    try {
        const project = await dbGet(
            `SELECT p.*, um.full_name as manager_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             WHERE p.id = ? AND p.foreman_id = ?`,
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Проект не найден"
            });
        }

        // Получение этапов
        const stages = await dbAll(
            "SELECT * FROM project_stages WHERE project_id = ? ORDER BY stage_number",
            [req.params.id]
        );

        // Получение материалов для каждого этапа
        for (const stage of stages) {
            stage.materials = await dbAll(
                "SELECT * FROM project_materials WHERE stage_id = ?",
                [stage.id]
            );

            stage.photos = await dbAll(
                "SELECT * FROM project_stage_photos WHERE stage_id = ?",
                [stage.id]
            );
        }

        // Получение документов
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ?",
            [req.params.id]
        );

        res.json({
            success: true,
            project,
            stages,
            documents
        });

    } catch (error) {
        console.error('Ошибка получения деталей проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Создание этапа работ
app.post('/api/foreman/stages', requireForeman, async (req, res) => {
    try {
        const { projectId, stageName, description, materials } = req.body;

        // Проверка принадлежности проекта
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND foreman_id = ?",
            [projectId, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        // Проверка дедлайна
        if (isDeadlinePassed(project.stages_deadline)) {
            return res.json({
                success: false,
                message: "Срок создания этапов истек (72 часа)"
            });
        }

        // Получение номера этапа
        const lastStage = await dbGet(
            "SELECT MAX(stage_number) as max_num FROM project_stages WHERE project_id = ?",
            [projectId]
        );

        const stageNumber = (lastStage?.max_num || 0) + 1;

        // Создание этапа
        const result = await dbRun(
            "INSERT INTO project_stages (project_id, stage_number, name, description, created_by) VALUES (?, ?, ?, ?, ?)",
            [projectId, stageNumber, stageName, description, req.session.userId]
        );

        const stageId = result.id;

        // Добавление материалов
        if (materials && Array.isArray(materials)) {
            for (const material of materials) {
                await dbRun(
                    "INSERT INTO project_materials (stage_id, material_name, unit, quantity_planned) VALUES (?, ?, ?, ?)",
                    [stageId, material.name, material.unit, material.quantity]
                );
            }
        }

        console.log(`✅ Этап создан: ${stageName} (проект ${projectId})`);

        res.json({
            success: true,
            stageId,
            message: "Этап создан"
        });

    } catch (error) {
        console.error('Ошибка создания этапа:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Обновление использованных материалов
app.put('/api/foreman/materials/:id/usage', requireForeman, async (req, res) => {
    try {
        const { quantityUsed } = req.body;

        // Получаем материал и проверяем принадлежность проекту прораба
        const material = await dbGet(
            `SELECT pm.*, p.foreman_id
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             JOIN projects p ON ps.project_id = p.id
             WHERE pm.id = ?`,
            [req.params.id]
        );

        if (!material) {
            return res.status(404).json({ success: false, message: 'Материал не найден' });
        }

        if (material.foreman_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: 'Нет доступа' });
        }

        const maxAllowed = parseFloat(material.quantity_received || 0);
        const requested = parseFloat(quantityUsed);

        if (requested > maxAllowed) {
            return res.json({
                success: false,
                message: `Нельзя списать ${requested} — на складе только ${maxAllowed}`
            });
        }

        if (requested < 0) {
            return res.json({ success: false, message: 'Расход не может быть отрицательным' });
        }

        await dbRun(
            'UPDATE project_materials SET quantity_used = ? WHERE id = ?',
            [requested, req.params.id]
        );

        res.json({ success: true, message: 'Расход обновлён' });
    } catch (error) {
        console.error('Ошибка обновления расхода:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Загрузка фото к этапу
app.post('/api/foreman/stages/:id/photos', requireForeman, upload.array('photos', 10), async (req, res) => {
    try {
        const stageId = req.params.id;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Файлы не загружены"
            });
        }

        // Проверка доступа к этапу
        const stage = await dbGet(
            `SELECT ps.* FROM project_stages ps
             JOIN projects p ON ps.project_id = p.id
             WHERE ps.id = ? AND p.foreman_id = ?`,
            [stageId, req.session.userId]
        );

        if (!stage) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        // Сохранение фото
        for (const file of req.files) {
            await dbRun(
                "INSERT INTO project_stage_photos (stage_id, file_name, file_path, uploaded_by, description) VALUES (?, ?, ?, ?, ?)",
                [stageId, file.originalname, file.path, req.session.userId, req.body.description || null]
            );
        }

        res.json({
            success: true,
            message: "Фото загружены",
            count: req.files.length
        });

    } catch (error) {
        console.error('Ошибка загрузки фото:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Отметка этапа как выполненного
app.put('/api/foreman/stages/:id/complete', requireForeman, async (req, res) => {
    try {
        // Проверка доступа
        const stage = await dbGet(
            `SELECT ps.* FROM project_stages ps
             JOIN projects p ON ps.project_id = p.id
             WHERE ps.id = ? AND p.foreman_id = ?`,
            [req.params.id, req.session.userId]
        );

        if (!stage) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        await dbRun(
            "UPDATE project_stages SET is_completed = 1, completed_at = datetime('now') WHERE id = ?",
            [req.params.id]
        );

        res.json({ success: true, message: "Этап отмечен как выполненный" });

    } catch (error) {
        console.error('Ошибка завершения этапа:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// API ДЛЯ СНАБЖЕНЦА
// ============================================================

// Получение проектов снабженца
app.get('/api/supplier/projects', requireSupplier, async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.supplier_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение материалов проекта
app.get('/api/supplier/projects/:id/materials', requireSupplier, async (req, res) => {
    try {
        // Проверка доступа
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND supplier_id = ?",
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        // Получение всех материалов проекта
        const materials = await dbAll(
            `SELECT pm.*, ps.name as stage_name, ps.stage_number
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             WHERE ps.project_id = ?
             ORDER BY ps.stage_number, pm.id`,
            [req.params.id]
        );

        res.json({
            success: true,
            project,
            materials
        });

    } catch (error) {
        console.error('Ошибка получения материалов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Экспорт материалов в Excel
app.get('/api/supplier/projects/:id/materials/export', requireSupplier, async (req, res) => {
    try {
        // Проверка доступа
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND supplier_id = ?",
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        // Получение материалов
        const materials = await dbAll(
            `SELECT ps.stage_number, ps.name as stage_name, 
                    pm.material_name, pm.unit, pm.quantity_planned, 
                    pm.quantity_used, pm.quantity_received, pm.is_received
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             WHERE ps.project_id = ?
             ORDER BY ps.stage_number, pm.id`,
            [req.params.id]
        );

        // Создание Excel файла
        const worksheet = XLSX.utils.json_to_sheet(materials);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Материалы');

        // Отправка файла
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename=materials_project_${req.params.id}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Ошибка экспорта материалов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// СНАБЖЕНЕЦ: детали проекта + материалы + новый функционал
// ============================================================

// Детали проекта (этапы + материалы) для снабженца
app.get('/api/supplier/projects/:id', requireSupplier, async (req, res) => {
    try {
        const project = await dbGet(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.id = ? AND p.supplier_id = ?`,
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        const stages = await dbAll(
            'SELECT * FROM project_stages WHERE project_id = ? ORDER BY stage_number',
            [req.params.id]
        );

        const materials = await dbAll(
            `SELECT pm.*, ps.name as stage_name, ps.stage_number
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             WHERE ps.project_id = ?
             ORDER BY ps.stage_number, pm.id`,
            [req.params.id]
        );

        res.json({ success: true, project, stages, materials });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Снабженец предлагает материал (через material_requests → прораб согласовывает)
app.post('/api/supplier/materials', requireSupplier, async (req, res) => {
    try {
        const { stageId, materialName, unit, quantity, notes } = req.body;

        if (!stageId || !materialName || !quantity) {
            return res.status(400).json({ success: false, message: 'Заполните обязательные поля' });
        }

        // Получаем этап и проверяем что снабженец в этом проекте
        const stage = await dbGet(
            `SELECT ps.*, p.supplier_id, p.foreman_id, p.id as project_id
             FROM project_stages ps
             JOIN projects p ON ps.project_id = p.id
             WHERE ps.id = ? AND p.supplier_id = ?`,
            [stageId, req.session.userId]
        );

        if (!stage) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        // Создаём заявку на материал (material_requests — ждёт согласования прораба)
        const result = await dbRun(
            `INSERT INTO material_requests 
             (project_id, foreman_id, supplier_id, material_name, quantity, unit, reason, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [stage.project_id, stage.foreman_id, req.session.userId,
                materialName, quantity, unit, notes || 'Предложено снабженцем']
        );

        res.json({ success: true, id: result.id, message: 'Материал отправлен прорабу на согласование' });
    } catch (error) {
        console.error('Ошибка добавления материала:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Снабженец получает список своих заявок на материалы (и от прораба тоже)
app.get('/api/supplier/material-requests', requireSupplier, async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT mr.*, 
                    p.title as project_title,
                    uf.full_name as foreman_name
             FROM material_requests mr
             JOIN projects p ON mr.project_id = p.id
             LEFT JOIN users uf ON mr.foreman_id = uf.id
             WHERE mr.supplier_id = ? OR p.supplier_id = ?
             ORDER BY mr.created_at DESC`,
            [req.session.userId, req.session.userId]
        );
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Снабженец обновляет статус заявки (принять в работу / отклонить / отметить доставленным)
app.put('/api/supplier/material-requests/:id', requireSupplier, async (req, res) => {
    try {
        const { status, notes } = req.body;

        const request = await dbGet(
            `SELECT mr.*, p.supplier_id 
             FROM material_requests mr
             JOIN projects p ON mr.project_id = p.id
             WHERE mr.id = ?`,
            [req.params.id]
        );

        if (!request || request.supplier_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        if (status === 'delivered') {
            // При доставке — создаём запись в project_materials для прораба
            // Ищем этап (первый доступный по проекту или конкретный)
            const stage = await dbGet(
                'SELECT id FROM project_stages WHERE project_id = ? ORDER BY stage_number LIMIT 1',
                [request.project_id]
            );

            if (stage) {
                // Проверяем не существует ли уже такой материал
                const exists = await dbGet(
                    'SELECT id FROM project_materials WHERE stage_id = ? AND material_name = ?',
                    [stage.id, request.material_name]
                );

                if (exists) {
                    // Обновляем количество полученного
                    await dbRun(
                        `UPDATE project_materials 
                         SET quantity_received = quantity_received + ?, is_received = 1, received_at = datetime('now')
                         WHERE id = ?`,
                        [request.quantity, exists.id]
                    );
                } else {
                    // Создаём новую запись
                    await dbRun(
                        `INSERT INTO project_materials 
                         (stage_id, material_name, unit, quantity_planned, quantity_received, is_received, received_at)
                         VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
                        [stage.id, request.material_name, request.unit, request.quantity, request.quantity]
                    );
                }
            }

            await dbRun(
                `UPDATE material_requests SET status = 'delivered', delivered_at = datetime('now'), notes = ?
                 WHERE id = ?`,
                [notes || null, req.params.id]
            );
        } else {
            await dbRun(
                "UPDATE material_requests SET status = ?, notes = ?, reviewed_at = datetime('now') WHERE id = ?",
                [status, notes || null, req.params.id]
            );
        }

        res.json({ success: true, message: 'Заявка обновлена' });
    } catch (error) {
        console.error('Ошибка обновления заявки:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Снабженец подтверждает доставку конкретного материала (quantity_received)
app.put('/api/supplier/materials/:id/deliver', requireSupplier, async (req, res) => {
    try {
        const { quantityReceived } = req.body;

        const material = await dbGet(
            `SELECT pm.*, p.supplier_id
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             JOIN projects p ON ps.project_id = p.id
             WHERE pm.id = ?`,
            [req.params.id]
        );

        if (!material || material.supplier_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        await dbRun(
            `UPDATE project_materials 
             SET quantity_received = ?, is_received = 1, received_at = datetime('now')
             WHERE id = ?`,
            [quantityReceived, req.params.id]
        );

        res.json({ success: true, message: 'Поступление на склад зафиксировано' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// ============================================================
// ПРОРАБ: Согласование материалов от снабженца + свои заявки
// ============================================================

// Прораб видит материалы ожидающие согласования от снабженца
app.get('/api/foreman/material-requests', requireForeman, async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT mr.*,
                    p.title as project_title,
                    us.full_name as supplier_name
             FROM material_requests mr
             JOIN projects p ON mr.project_id = p.id
             LEFT JOIN users us ON mr.supplier_id = us.id
             WHERE mr.foreman_id = ?
             ORDER BY mr.created_at DESC`,
            [req.session.userId]
        );
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Прораб согласует или отклоняет предложение снабженца
app.put('/api/foreman/material-requests/:id', requireForeman, async (req, res) => {
    try {
        const { status, notes } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Недопустимый статус' });
        }

        const request = await dbGet(
            'SELECT * FROM material_requests WHERE id = ? AND foreman_id = ?',
            [req.params.id, req.session.userId]
        );

        if (!request) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        await dbRun(
            `UPDATE material_requests SET status = ?, notes = ?, reviewed_at = datetime('now')
             WHERE id = ?`,
            [status, notes || null, req.params.id]
        );

        res.json({ success: true, message: status === 'approved' ? 'Материал согласован' : 'Материал отклонён' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Прораб создаёт заявку на дополнительный материал (когда запасы закончились)
app.post('/api/foreman/material-requests', requireForeman, async (req, res) => {
    try {
        const { projectId, materialName, unit, quantity, reason } = req.body;

        if (!projectId || !materialName || !quantity) {
            return res.status(400).json({ success: false, message: 'Заполните обязательные поля' });
        }

        const project = await dbGet(
            'SELECT * FROM projects WHERE id = ? AND foreman_id = ?',
            [projectId, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: 'Доступ запрещён' });
        }

        const result = await dbRun(
            `INSERT INTO material_requests 
             (project_id, foreman_id, supplier_id, material_name, quantity, unit, reason, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [projectId, req.session.userId, project.supplier_id,
                materialName, quantity, unit, reason || 'Запрос от прораба']
        );

        res.json({ success: true, id: result.id, message: 'Заявка отправлена снабженцу' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// ============================================================
// API ДЛЯ ИНЖЕНЕРА ПТО
// ============================================================

// Получение проектов ПТО
app.get('/api/pto/projects', requirePTO, async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.pto_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение проекта с этапами для формирования ИД
app.get('/api/pto/projects/:id', requirePTO, async (req, res) => {
    try {
        const project = await dbGet(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.id = ? AND p.pto_id = ?`,
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        // Получение этапов с фото
        const stages = await dbAll(
            "SELECT * FROM project_stages WHERE project_id = ? ORDER BY stage_number",
            [req.params.id]
        );

        for (const stage of stages) {
            stage.photos = await dbAll(
                "SELECT * FROM project_stage_photos WHERE stage_id = ?",
                [stage.id]
            );

            stage.materials = await dbAll(
                "SELECT * FROM project_materials WHERE stage_id = ?",
                [stage.id]
            );
        }

        // Получение документов
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ?",
            [req.params.id]
        );

        res.json({
            success: true,
            project,
            stages,
            documents
        });

    } catch (error) {
        console.error('Ошибка получения проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Загрузка исполнительной документации
app.post('/api/pto/projects/:id/documents', requirePTO, upload.array('documents', 10), async (req, res) => {
    try {
        // Проверка доступа
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND pto_id = ?",
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещен"
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Файлы не загружены"
            });
        }

        // Сохранение документов
        for (const file of req.files) {
            await dbRun(
                "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'executive', ?, ?, ?, ?)",
                [req.params.id, file.originalname, file.path, req.session.userId, req.body.description || null]
            );
        }

        res.json({
            success: true,
            message: "Документы загружены",
            count: req.files.length
        });

    } catch (error) {
        console.error('Ошибка загрузки документов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// API ДЛЯ ЗАКАЗЧИКА
// ============================================================

// Создание заявки на проект
app.post('/api/customer/requests', requireCustomer, upload.array('documents', 5), async (req, res) => {
    try {
        const { title, description, contactInfo } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Заполните обязательные поля"
            });
        }

        // Сохранение путей к документам
        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO project_requests (customer_id, title, description, documents, contact_info) VALUES (?, ?, ?, ?, ?)",
            [req.session.userId, title, description, documentPaths, contactInfo]
        );

        console.log(`✅ Заявка создана: ${title} (клиент ${req.session.userName})`);

        res.json({
            success: true,
            message: "Заявка отправлена. С вами свяжется наш менеджер."
        });

    } catch (error) {
        console.error('Ошибка создания заявки:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Присоединение к проекту по коду
app.post('/api/customer/join', requireCustomer, async (req, res) => {
    try {
        const { accessCode } = req.body;

        if (!accessCode) {
            return res.status(400).json({
                success: false,
                message: "Введите код проекта"
            });
        }

        const project = await dbGet(
            "SELECT * FROM projects WHERE access_code = ?",
            [accessCode]
        );

        if (!project) {
            return res.json({
                success: false,
                message: "Проект с таким кодом не найден"
            });
        }

        if (project.customer_id && project.customer_id !== req.session.userId) {
            return res.json({
                success: false,
                message: "К этому проекту уже привязан другой заказчик"
            });
        }

        // Привязка заказчика
        await dbRun(
            "UPDATE projects SET customer_id = ? WHERE id = ?",
            [req.session.userId, project.id]
        );

        console.log(`✅ Заказчик ${req.session.userName} присоединился к проекту ${project.title}`);

        res.json({
            success: true,
            project: {
                id: project.id,
                title: project.title,
                address: project.address
            }
        });

    } catch (error) {
        console.error('Ошибка присоединения к проекту:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение проектов заказчика
app.get('/api/customer/projects', requireCustomer, async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, 
                    um.full_name as manager_name, 
                    um.email as manager_email, 
                    um.phone as manager_phone
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             WHERE p.customer_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение деталей проекта для заказчика
app.get('/api/customer/projects/:id', requireCustomer, async (req, res) => {
    try {
        const project = await dbGet(
            `SELECT p.*, 
                    um.full_name as manager_name, um.email as manager_email, um.phone as manager_phone,
                    uf.full_name as foreman_name, uf.phone as foreman_phone
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.id = ? AND p.customer_id = ?`,
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Проект не найден"
            });
        }

        // Получение этапов (только завершенные или все - решите сами)
        const stages = await dbAll(
            "SELECT * FROM project_stages WHERE project_id = ? ORDER BY stage_number",
            [req.params.id]
        );

        for (const stage of stages) {
            stage.photos = await dbAll(
                "SELECT id, file_name, file_path, uploaded_at, description FROM project_stage_photos WHERE stage_id = ?",
                [stage.id]
            );
        }

        // Получение документов
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ?",
            [req.params.id]
        );

        res.json({
            success: true,
            project,
            stages,
            documents
        });

    } catch (error) {
        console.error('Ошибка получения проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Получение статуса заявок заказчика
app.get('/api/customer/requests', requireCustomer, async (req, res) => {
    try {
        const requests = await dbAll(
            "SELECT * FROM project_requests WHERE customer_id = ? ORDER BY created_at DESC",
            [req.session.userId]
        );

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// ОБЩИЕ API
// ============================================================

// Получение документов проекта
app.get('/api/projects/:id/documents', requireAuth, async (req, res) => {
    try {
        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC",
            [req.params.id]
        );

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Ошибка получения документов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        message: "Внутренняя ошибка сервера"
    });
});
// ==========================================
// НОВЫЕ API: ПРИСОЕДИНЕНИЕ ПО КОДУ (СНАБЖЕНЕЦ И ПТО)
// ==========================================

// 1. Снабженец вводит код
app.post('/api/supplier/join', async (req, res) => { // Добавь middleware requireSupplier если используешь
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: "Нет авторизации" });
        const { accessCode } = req.body;

        const project = await dbGet("SELECT * FROM projects WHERE access_code = ?", [accessCode]);
        if (!project) return res.json({ success: false, message: "Неверный код" });

        if (project.supplier_id && project.supplier_id !== req.session.userId) {
            return res.json({ success: false, message: "У проекта уже есть снабженец" });
        }

        await dbRun("UPDATE projects SET supplier_id = ? WHERE id = ?", [req.session.userId, project.id]);
        res.json({ success: true, message: "Вы добавлены в проект!" });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 2. ПТО вводит код
app.post('/api/pto/join', async (req, res) => { // Добавь middleware requirePTO если используешь
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: "Нет авторизации" });
        const { accessCode } = req.body;

        const project = await dbGet("SELECT * FROM projects WHERE access_code = ?", [accessCode]);
        if (!project) return res.json({ success: false, message: "Неверный код" });

        if (project.pto_id && project.pto_id !== req.session.userId) {
            return res.json({ success: false, message: "У проекта уже есть инженер ПТО" });
        }

        await dbRun("UPDATE projects SET pto_id = ? WHERE id = ?", [req.session.userId, project.id]);
        res.json({ success: true, message: "Вы добавлены в проект!" });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.get('/api/foreman/materials', requireForeman, async (req, res) => {
    try {
        const materials = await dbAll(
            `SELECT pm.*, 
                    ps.name as stage_name,
                    ps.project_id,
                    p.title as project_title
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             JOIN projects p ON ps.project_id = p.id
             WHERE p.foreman_id = ?
             ORDER BY p.id, ps.stage_number, pm.id`,
            [req.session.userId]
        );

        res.json({ success: true, materials });
    } catch (error) {
        console.error('Ошибка получения материалов:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});
app.get('/api/manager/requests/archive', requireManagerOrAdmin, async (req, res) => {
    try {
        const requests = await dbAll(
            `SELECT pr.*, 
                    u.full_name as customer_name, 
                    u.email, 
                    u.phone,
                    rv.full_name as reviewer_name
             FROM project_requests pr
             JOIN users u ON pr.customer_id = u.id
             LEFT JOIN users rv ON pr.reviewer_id = rv.id
             WHERE pr.status IN ('accepted', 'rejected', 'reviewed')
             ORDER BY pr.reviewed_at DESC`,
            []
        );

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Ошибка получения архива:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📂 Среда: ${process.env.NODE_ENV || 'development'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    db.close((err) => {
        if (err) {
            console.error('Ошибка закрытия БД:', err);
        } else {
            console.log('💾 База данных отключена');
        }
        process.exit(0);
    });
});