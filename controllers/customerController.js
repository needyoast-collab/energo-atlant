const { dbGet, dbAll, dbRun } = require('../config/database');
const { sendDirectNotification } = require('../utils/helpers');

exports.createRequest = async (req, res) => {
    try {
        const { title, description, contactInfo } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Заполните обязательные поля"
            });
        }

        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO project_requests (customer_id, title, description, documents, contact_info) VALUES (?, ?, ?, ?, ?)",
            [req.session.userId, title, description, documentPaths, contactInfo]
        );

        console.log(`✅ Заявка создана: ${title} (клиент ${req.session.userName})`);

        try {
            const customer = await dbGet('SELECT full_name FROM users WHERE id = ?', [req.session.userId]);
            const managers = await dbAll("SELECT id FROM users WHERE role = 'manager' AND is_active = 1");
            const notifMsg = `Новая заявка от заказчика ${customer ? customer.full_name : req.session.userName}: "${title}"`;
            for (const mgr of managers) {
                await sendDirectNotification(mgr.id, null, 'new_request', notifMsg);
            }
        } catch (notifErr) {
            console.error('Ошибка уведомления менеджера:', notifErr);
        }

        res.json({
            success: true,
            message: "Заявка отправлена. С вами свяжется наш менеджер."
        });

    } catch (error) {
        console.error('Ошибка создания заявки:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

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
};

exports.getProjects = async (req, res) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, 
                    um.full_name as manager_name, 
                    um.email as manager_email, 
                    um.phone as manager_phone,
                    (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id) as total_stages,
                    (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id AND ps.is_completed = 1) as completed_stages,
                    (SELECT COUNT(*) FROM project_stage_photos psp 
                     JOIN project_stages ps ON psp.stage_id = ps.id 
                     WHERE ps.project_id = p.id) as photo_count,
                    (SELECT COUNT(*) FROM project_documents pd WHERE pd.project_id = p.id) as doc_count,
                    (SELECT COUNT(*) FROM notifications n WHERE n.project_id = p.id AND n.user_id = ? AND n.type = 'photo' AND n.is_read = 0) as unread_photos,
                    (SELECT COUNT(*) FROM notifications n WHERE n.project_id = p.id AND n.user_id = ? AND n.type = 'document' AND n.is_read = 0) as unread_docs
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             WHERE p.customer_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId, req.session.userId, req.session.userId]
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

        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ?",
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

        res.json({
            success: true,
            project,
            stages,
            documents,
            materials
        });

    } catch (error) {
        console.error('Ошибка получения проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getRequests = async (req, res) => {
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
};
