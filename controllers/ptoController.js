const { dbGet, dbAll, dbRun } = require('../config/database');
const { uploadToSupabase } = require('../utils/supabaseStorage');
const { getSafeFileName } = require('../utils/helpers');
const { z } = require('zod');

const joinProjectSchema = z.object({
    accessCode: z.string().min(4).max(20)
});

exports.joinProject = async (req, res, next) => {
    try {
        const parseResult = joinProjectSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors?.[0]?.message || 'Ошибка валидации' });
        }

        const { accessCode } = parseResult.data;
        const project = await dbGet("SELECT * FROM projects WHERE access_code = ? AND is_deleted = 0", [accessCode]);
        if (!project) return res.status(404).json({ success: false, message: "Проект не найден" });

        if (project.pto_id && project.pto_id !== req.session.userId) {
            return res.status(400).json({ success: false, message: "У проекта уже есть инженер ПТО" });
        }

        await dbRun("UPDATE projects SET pto_id = ? WHERE id = ?", [req.session.userId, project.id]);
        res.json({ success: true, message: "Вы добавлены в проект!" });
    } catch (error) {
        next(error);
    }
};

exports.getProjects = async (req, res, next) => {
    try {
        const projects = await dbAll(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.pto_id = ? AND p.is_deleted = 0
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );
        res.json({ success: true, projects });
    } catch (error) {
        next(error);
    }
};

exports.getProjectDetails = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const project = await dbGet(
            `SELECT p.*, um.full_name as manager_name, uf.full_name as foreman_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users uf ON p.foreman_id = uf.id
             WHERE p.id = ? AND (p.pto_id = ? OR ? = 'admin') AND p.is_deleted = 0`,
            [projectId, req.session.userId, req.session.userRole]
        );

        if (!project) return res.status(403).json({ success: false, message: "Доступ запрещен" });

        const stages = await dbAll("SELECT * FROM project_stages WHERE project_id = ? AND is_deleted = 0 ORDER BY stage_number", [projectId]);
        for (const stage of stages) {
            stage.photos = await dbAll("SELECT * FROM project_stage_photos WHERE stage_id = ? AND is_deleted = 0", [stage.id]);
            stage.materials = await dbAll("SELECT * FROM project_materials WHERE stage_id = ? AND is_deleted = 0", [stage.id]);
        }

        const documents = await dbAll("SELECT * FROM project_documents WHERE project_id = ? AND is_deleted = 0", [projectId]);

        res.json({ success: true, project, stages, documents });
    } catch (error) {
        next(error);
    }
};

exports.uploadExecutiveDocuments = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const project = await dbGet("SELECT * FROM projects WHERE id = ? AND (pto_id = ? OR ? = 'admin') AND is_deleted = 0", [projectId, req.session.userId, req.session.userRole]);

        if (!project) return res.status(403).json({ success: false, message: "Доступ запрещен" });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: "Файлы не загружены" });
        }

        for (const file of req.files) {
            const fileName = getSafeFileName(file);
            const cloudPath = await uploadToSupabase(file, 'projects/pto');
            await dbRun(
                "INSERT INTO project_documents (project_id, document_type, file_name, file_path, uploaded_by, description) VALUES (?, 'executive', ?, ?, ?, ?)",
                [projectId, fileName, cloudPath, req.session.userId, req.body.description || null]
            );
        }

        res.json({ success: true, message: "Документы загружены", count: req.files.length });
    } catch (error) {
        next(error);
    }
};
