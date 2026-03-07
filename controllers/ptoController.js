const { dbGet, dbAll, dbRun } = require('../config/database');

exports.joinProject = async (req, res) => {
    try {
        const { accessCode } = req.body;

        const project = await dbGet("SELECT * FROM projects WHERE access_code = ?", [accessCode]);
        if (!project) return res.json({ success: false, message: "Неверный код" });

        if (project.pto_id && project.pto_id !== req.session.userId) {
            return res.json({ success: false, message: "У проекта уже есть инженер ПТО" });
        }

        await dbRun("UPDATE projects SET pto_id = ? WHERE id = ?", [req.session.userId, project.id]);
        res.json({ success: true, message: "Вы добавлены в проект!" });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getProjects = async (req, res) => {
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
};

exports.getProjectDetails = async (req, res) => {
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
};

exports.uploadExecutiveDocuments = async (req, res) => {
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
            const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            await dbRun(
                "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'executive', ?, ?, ?, ?)",
                [req.params.id, fileName, file.path, req.session.userId, req.body.description || null]
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
};
