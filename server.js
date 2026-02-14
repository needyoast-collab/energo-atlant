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
        db.run(sql, params, function(err) {
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
        'customer': 'dashboard_customer.html'
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

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
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
app.post('/api/manager/projects', requireManagerOrAdmin, upload.array('documents', 10), async (req, res) => {
    try {
        const { title, address, description, clientName, clientOrganization, foremanId, supplierId, ptoId } = req.body;

        if (!title) {
            return res.status(400).json({ 
                success: false, 
                message: "Укажите название проекта" 
            });
        }

        // Генерация уникального кода
        let accessCode;
        let codeExists = true;
        
        while (codeExists) {
            accessCode = generateProjectCode();
            const existing = await dbGet("SELECT id FROM projects WHERE access_code = ?", [accessCode]);
            codeExists = !!existing;
        }

        // Дедлайн для создания этапов (72 часа)
        const stagesDeadline = formatDateForDB(addHours(new Date(), 72));

        // Создание проекта
        const result = await dbRun(
            `INSERT INTO projects (title, address, description, client_name, client_organization, access_code, 
             status, stages_deadline, manager_id, foreman_id, supplier_id, pto_id)
             VALUES (?, ?, ?, ?, ?, ?, 'stages_pending', ?, ?, ?, ?, ?)`,
            [title, address, description, clientName, clientOrganization, accessCode, stagesDeadline,
             req.session.userId, foremanId || null, supplierId || null, ptoId || null]
        );

        const projectId = result.id;

        // Сохранение документов
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await dbRun(
                    "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by) VALUES (?, 'initial', ?, ?, ?)",
                    [projectId, file.originalname, file.path, req.session.userId]
                );
            }
        }

        console.log(`✅ Проект создан: ${title} (${accessCode})`);

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
app.put('/api/foreman/materials/:id', requireForeman, async (req, res) => {
    try {
        const { quantityUsed } = req.body;

        await dbRun(
            "UPDATE project_materials SET quantity_used = ? WHERE id = ?",
            [quantityUsed, req.params.id]
        );

        res.json({ success: true, message: "Расход материала обновлен" });

    } catch (error) {
        console.error('Ошибка обновления материала:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

// Подтверждение прихода материалов
app.put('/api/foreman/materials/:id/receive', requireForeman, async (req, res) => {
    try {
        const { quantityReceived } = req.body;

        await dbRun(
            "UPDATE project_materials SET quantity_received = ?, is_received = 1, received_at = datetime('now') WHERE id = ?",
            [quantityReceived, req.params.id]
        );

        res.json({ success: true, message: "Приход материала подтвержден" });

    } catch (error) {
        console.error('Ошибка подтверждения прихода:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
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