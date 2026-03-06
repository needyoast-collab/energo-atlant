const { dbGet, dbAll, dbRun } = require('../config/database');
const { sendNotification, sendDirectNotification } = require('../utils/helpers');

// Присоединение к проекту по коду
exports.joinProject = async (req, res) => {
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
};

// Получение проектов прораба
exports.getProjects = async (req, res) => {
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
};

// Получение деталей проекта с этапами
exports.getProjectDetails = async (req, res) => {
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
};

// Создание этапа работ
exports.createStage = async (req, res) => {
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
};

// Обновление использованных материалов
exports.updateMaterialUsage = async (req, res) => {
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
        const alreadyUsed = parseFloat(material.quantity_used || 0);
        const requested = parseFloat(quantityUsed);

        if (requested <= 0) {
            return res.json({ success: false, message: 'Введите количество больше 0' });
        }

        const remainingStock = maxAllowed - alreadyUsed;

        if (requested > remainingStock) {
            return res.json({
                success: false,
                message: `Нельзя списать ${requested} — на складе только ${remainingStock.toFixed(2)}`
            });
        }

        if (requested < 0) {
            return res.json({ success: false, message: 'Расход не может быть отрицательным' });
        }

        await dbRun(
            'UPDATE project_materials SET quantity_used = quantity_used + ? WHERE id = ?',
            [requested, req.params.id]
        );

        res.json({ success: true, message: `Списано ${requested} единиц. Остаток на складе: ${(remainingStock - requested).toFixed(2)}` });
    } catch (error) {
        console.error('Ошибка обновления расхода:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// Загрузка фото к этапу
exports.uploadStagePhotos = async (req, res) => {
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

        sendNotification(stage.project_id, 'photo', `Прораб загрузил фото (${req.files.length} шт.) к этапу`);

        res.json({
            success: true,
            message: "Фото загружены",
            count: req.files.length
        });

    } catch (error) {
        console.error('Ошибка загрузки фото:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

// Отметка этапа как выполненного
exports.completeStage = async (req, res) => {
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

        // Уведомить заказчика
        sendNotification(stage.project_id, 'stage_complete', `Этап "${stage.name || 'Без названия'}" завершён`);
        // Уведомить менеджера проекта
        try {
            const project = await dbGet('SELECT manager_id, title FROM projects WHERE id = ?', [stage.project_id]);
            if (project && project.manager_id) {
                await sendDirectNotification(
                    project.manager_id,
                    stage.project_id,
                    'stage_complete',
                    `Прораб завершил этап "${stage.name || 'Без названия'}" по проекту "${project.title}"`
                );
            }
        } catch (e) { console.error('Ошибка уведомления менеджера об этапе:', e); }

        res.json({ success: true, message: "Этап отмечен как выполненный" });

    } catch (error) {
        console.error('Ошибка завершения этапа:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

// Прораб видит материалы ожидающие согласования от снабженца
exports.getMaterialRequests = async (req, res) => {
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
};

// Прораб согласует или отклоняет предложение снабженца
exports.reviewMaterialRequest = async (req, res) => {
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
};

// Прораб создаёт заявку на дополнительный материал (когда запасы закончились)
exports.createMaterialRequest = async (req, res) => {
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
};

exports.getMaterials = async (req, res) => {
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
};
