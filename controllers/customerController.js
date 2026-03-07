const { dbGet, dbAll, dbRun } = require('../config/database');
const { sendDirectNotification } = require('../utils/helpers');
const { z } = require('zod');

// Схемы валидации
const createRequestSchema = z.object({
    title: z.string().min(3, "Заголовок слишком короткий").max(200),
    description: z.string().min(10, "Описание должно быть подробным"),
    contactInfo: z.string().optional()
});

const joinProjectSchema = z.object({
    accessCode: z.string().min(1, "Введите код доступа")
});

const projectIdSchema = z.object({
    id: z.string().regex(/^\d+$/, "Неверный ID проекта").transform(Number)
});

exports.createRequest = async (req, res, next) => {
    try {
        const validated = createRequestSchema.parse(req.body);
        const { title, description, contactInfo } = validated;

        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO project_requests (customer_id, title, description, documents, contact_info) VALUES (?, ?, ?, ?, ?)",
            [req.session.userId, title, description, documentPaths, contactInfo]
        );

        console.log(`✅ Заявка создана: ID ${req.session.userId} (${req.session.userName})`);

        // Уведомление менеджеров (опционально)
        try {
            const managers = await dbAll("SELECT id FROM users WHERE role = 'manager' AND is_active = 1");
            const notifMsg = `Новая заявка: "${title}" от ${req.session.userName}`;
            for (const mgr of managers) {
                await sendDirectNotification(mgr.id, null, 'new_request', notifMsg);
            }
        } catch (e) {
            console.warn('Не удалось отправить уведомление менеджерам');
        }

        res.json({
            success: true,
            message: "Заявка отправлена. С вами свяжется наш менеджер."
        });

    } catch (error) {
        next(error);
    }
};

exports.joinProject = async (req, res, next) => {
    try {
        const { accessCode } = joinProjectSchema.parse(req.body);

        const project = await dbGet(
            "SELECT id, title, address, customer_id FROM projects WHERE access_code = ?",
            [accessCode]
        );

        if (!project) {
            return res.status(404).json({ success: false, message: "Проект с таким кодом не найден" });
        }

        if (project.customer_id && project.customer_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: "К этому проекту уже привязан другой заказчик" });
        }

        await dbRun(
            "UPDATE projects SET customer_id = ? WHERE id = ?",
            [req.session.userId, project.id]
        );

        console.log(`✅ Заказчик ID ${req.session.userId} присоединился к проекту ${project.id}`);

        res.json({
            success: true,
            project: { id: project.id, title: project.title, address: project.address }
        });

    } catch (error) {
        next(error);
    }
};

exports.getProjects = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const projects = await dbAll(
            `SELECT p.id, p.title, p.address, p.status, p.created_at,
                    um.full_name as manager_name, 
                    um.email as manager_email, 
                    um.phone as manager_phone,
                    (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id) as total_stages,
                    (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id AND ps.is_completed = 1) as completed_stages,
                    (SELECT COUNT(*) FROM project_documents pd WHERE pd.project_id = p.id) as doc_count,
                    (SELECT COUNT(*) FROM notifications n WHERE n.project_id = p.id AND n.user_id = ? AND n.is_read = 0) as unread_count
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             WHERE p.customer_id = ?
             ORDER BY p.created_at DESC`,
            [userId, userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        next(error);
    }
};

exports.getProjectDetails = async (req, res, next) => {
    try {
        const { id } = projectIdSchema.parse(req.params);
        const userId = req.session.userId;

        const project = await dbGet(
            `SELECT p.*, 
                    um.full_name as manager_name, um.email as manager_email, um.phone as manager_phone,
                    uf.full_name as foreman_name, uf.phone as foreman_phone
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.id = ? AND p.customer_id = ?`,
            [id, userId]
        );

        if (!project) {
            return res.status(404).json({ success: false, message: "Проект не найден или доступ запрещен" });
        }

        const stages = await dbAll(
            "SELECT * FROM project_stages WHERE project_id = ? ORDER BY stage_number",
            [id]
        );

        for (const stage of stages) {
            stage.photos = await dbAll(
                "SELECT id, file_name, file_path, uploaded_at, description FROM project_stage_photos WHERE stage_id = ?",
                [stage.id]
            );
        }

        const documents = await dbAll(
            "SELECT id, document_type, file_name, file_path, uploaded_at, description FROM project_documents WHERE project_id = ?",
            [id]
        );

        const materials = await dbAll(
            `SELECT pm.*, ps.name as stage_name, ps.stage_number
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             WHERE ps.project_id = ?
             ORDER BY ps.stage_number, pm.id`,
            [id]
        );

        res.json({
            success: true,
            project,
            stages,
            documents,
            materials
        });

    } catch (error) {
        next(error);
    }
};

exports.getRequests = async (req, res, next) => {
    try {
        const requests = await dbAll(
            "SELECT id, title, description, status, created_at, notes FROM project_requests WHERE customer_id = ? ORDER BY created_at DESC",
            [req.session.userId]
        );

        res.json({ success: true, requests });
    } catch (error) {
        next(error);
    }
};
