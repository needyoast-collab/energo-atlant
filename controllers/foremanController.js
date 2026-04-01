const { dbGet, dbAll, dbRun } = require('../config/database');
const { uploadToStorage: uploadToSupabase } = require('../utils/s3Storage');
const { sendNotification, sendDirectNotification, getSafeFileName } = require('../utils/helpers');
const { z } = require('zod');

// Схемы валидации
const accessCodeSchema = z.object({
    accessCode: z.string().min(1, "Введите код доступа")
});

const createStageSchema = z.object({
    projectId: z.number().int(),
    stageName: z.string().min(2, "Название этапа слишком короткое").max(100),
    description: z.string().optional(),
    materials: z.array(z.object({
        name: z.string(),
        unit: z.string().optional(),
        quantity: z.number().positive()
    })).optional()
});

const updateMaterialSchema = z.object({
    quantityUsed: z.number().positive("Количество должно быть положительным")
});

const materialRequestSchema = z.object({
    projectId: z.number().int(),
    materialName: z.string().min(1),
    unit: z.string().optional(),
    quantity: z.number().positive(),
    reason: z.string().optional()
});

const reviewRequestSchema = z.object({
    status: z.enum(['approved', 'rejected']),
    notes: z.string().optional()
});

const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/).transform(Number)
});

// Присоединение к проекту по коду
exports.joinProject = async (req, res, next) => {
    try {
        const { accessCode } = accessCodeSchema.parse(req.body);

        const project = await dbGet(
            "SELECT id, title, address, foreman_id FROM projects WHERE access_code = ? AND is_deleted = 0",
            [accessCode]
        );

        if (!project) {
            return res.status(404).json({ success: false, message: "Проект с таким кодом не найден" });
        }

        if (project.foreman_id && project.foreman_id !== req.session.userId) {
            return res.status(403).json({ success: false, message: "К этому проекту уже привязан другой прораб" });
        }

        await dbRun(
            "UPDATE projects SET foreman_id = ? WHERE id = ?",
            [req.session.userId, project.id]
        );

        console.log(`✅ Прораб ID ${req.session.userId} присоединился к проекту ${project.id}`);

        res.json({
            success: true,
            project: { id: project.id, title: project.title, address: project.address }
        });

    } catch (error) {
        next(error);
    }
};

// Получение проектов прораба
exports.getProjects = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const projects = await dbAll(
            `SELECT p.id, p.title, p.address, p.status, p.created_at,
                    um.full_name as manager_name,
                    us.full_name as supplier_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             LEFT JOIN users us ON p.supplier_id = us.id
             WHERE p.foreman_id = ? AND p.is_deleted = 0
             ORDER BY p.created_at DESC`,
            [userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        next(error);
    }
};

// Получение деталей проекта с этапами
exports.getProjectDetails = async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const userId = req.session.userId;

        const project = await dbGet(
            `SELECT p.*, um.full_name as manager_name
             FROM projects p
             LEFT JOIN users um ON p.manager_id = um.id
             WHERE p.id = ? AND p.foreman_id = ? AND p.is_deleted = 0`,
            [id, userId]
        );

        if (!project) {
            return res.status(404).json({ success: false, message: "Проект не найден или доступ запрещен" });
        }

        const stages = await dbAll(
            "SELECT * FROM project_stages WHERE project_id = ? AND is_deleted = 0 ORDER BY stage_number",
            [id]
        );

        for (const stage of stages) {
            stage.materials = await dbAll(
                "SELECT * FROM project_materials WHERE stage_id = ? AND is_deleted = 0",
                [stage.id]
            );
            stage.photos = await dbAll(
                "SELECT id, file_name, file_path, uploaded_at FROM project_stage_photos WHERE stage_id = ? AND is_deleted = 0",
                [stage.id]
            );
        }

        const documents = await dbAll(
            "SELECT id, file_name, file_path, document_type, uploaded_at FROM project_documents WHERE project_id = ? AND is_deleted = 0",
            [id]
        );

        res.json({ success: true, project, stages, documents });

    } catch (error) {
        next(error);
    }
};

// Создание этапа работ
exports.createStage = async (req, res, next) => {
    try {
        const validated = createStageSchema.parse(req.body);
        const { projectId, stageName, description, materials } = validated;
        const userId = req.session.userId;

        const project = await dbGet(
            "SELECT id FROM projects WHERE id = ? AND foreman_id = ? AND is_deleted = 0",
            [projectId, userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        const lastStage = await dbGet(
            "SELECT MAX(stage_number) as max_num FROM project_stages WHERE project_id = ? AND is_deleted = 0",
            [projectId]
        );

        const stageNumber = (lastStage?.max_num || 0) + 1;

        const result = await dbRun(
            "INSERT INTO project_stages (project_id, stage_number, name, description, created_by) VALUES (?, ?, ?, ?, ?)",
            [projectId, stageNumber, stageName, description, userId]
        );

        const stageId = result.id;

        if (materials && materials.length > 0) {
            for (const mat of materials) {
                await dbRun(
                    "INSERT INTO project_materials (stage_id, material_name, unit, quantity_planned) VALUES (?, ?, ?, ?)",
                    [stageId, mat.name, mat.unit, mat.quantity]
                );
            }
        }

        res.json({ success: true, stageId, message: "Этап успешно создан" });

    } catch (error) {
        next(error);
    }
};

// Обновление использованных материалов
exports.updateMaterialUsage = async (req, res, next) => {
    try {
        const { id: materialId } = idParamSchema.parse(req.params);
        const { quantityUsed } = updateMaterialSchema.parse(req.body);
        const userId = req.session.userId;

        const material = await dbGet(
            `SELECT pm.*, p.foreman_id, p.id as project_id
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             JOIN projects p ON ps.project_id = p.id
             WHERE pm.id = ? AND pm.is_deleted = 0 AND ps.is_deleted = 0 AND p.is_deleted = 0`,
            [materialId]
        );

        if (!material || material.foreman_id !== userId) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        const stock = (material.quantity_received || 0) - (material.quantity_used || 0);
        if (quantityUsed > stock) {
            return res.status(400).json({ success: false, message: `На складе только ${stock}` });
        }

        await dbRun(
            "UPDATE project_materials SET quantity_used = quantity_used + ? WHERE id = ?",
            [quantityUsed, materialId]
        );

        res.json({ success: true, message: "Расход материалов обновлен" });

    } catch (error) {
        next(error);
    }
};

// Загрузка фото к этапу
exports.uploadStagePhotos = async (req, res, next) => {
    try {
        const { id: stageId } = idParamSchema.parse(req.params);
        const userId = req.session.userId;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: "Файлы не выбраны" });
        }

        const stage = await dbGet(
            `SELECT ps.id, p.id as project_id FROM project_stages ps
             JOIN projects p ON ps.project_id = p.id
             WHERE ps.id = ? AND p.foreman_id = ? AND ps.is_deleted = 0 AND p.is_deleted = 0`,
            [stageId, userId]
        );

        if (!stage) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        for (const file of req.files) {
            const fileName = getSafeFileName(file);
            const cloudPath = await uploadToSupabase(file, 'projects/photos');
            await dbRun(
                "INSERT INTO project_stage_photos (stage_id, file_name, file_path, uploaded_by, description) VALUES (?, ?, ?, ?, ?)",
                [stageId, fileName, cloudPath, userId, req.body.description || null]
            );
        }

        sendNotification(stage.project_id, 'photo', `Прораб загрузил фото (${req.files.length} шт.)`);
        res.json({ success: true, message: "Фотографии загружены" });

    } catch (error) {
        next(error);
    }
};

// Отметка этапа как выполненного
exports.completeStage = async (req, res, next) => {
    try {
        const { id: stageId } = idParamSchema.parse(req.params);
        const userId = req.session.userId;

        const stage = await dbGet(
            `SELECT ps.*, p.title as project_title, p.manager_id FROM project_stages ps
             JOIN projects p ON ps.project_id = p.id
             WHERE ps.id = ? AND p.foreman_id = ? AND ps.is_deleted = 0 AND p.is_deleted = 0`,
            [stageId, userId]
        );

        if (!stage) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        await dbRun(
            "UPDATE project_stages SET is_completed = 1, completed_at = datetime('now') WHERE id = ?",
            [stageId]
        );

        sendNotification(stage.project_id, 'stage_complete', `Этап "${stage.name}" завершен`);
        if (stage.manager_id) {
            await sendDirectNotification(stage.manager_id, stage.project_id, 'stage_complete', `Завершен этап "${stage.name}" по проекту ${stage.project_title}`);
        }

        res.json({ success: true, message: "Этап завершен" });

    } catch (error) {
        next(error);
    }
};

// Прораб видит материалы ожидающие согласования от снабженца
exports.getMaterialRequests = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const requests = await dbAll(
            `SELECT mr.*, p.title as project_title, us.full_name as supplier_name
             FROM material_requests mr
             JOIN projects p ON mr.project_id = p.id
             LEFT JOIN users us ON mr.supplier_id = us.id
             WHERE mr.foreman_id = ? AND mr.is_deleted = 0
             ORDER BY mr.created_at DESC`,
            [userId]
        );
        res.json({ success: true, requests });
    } catch (error) {
        next(error);
    }
};

// Прораб согласует или отклоняет предложение снабженца
exports.reviewMaterialRequest = async (req, res, next) => {
    try {
        const { id: requestId } = idParamSchema.parse(req.params);
        const { status, notes } = reviewRequestSchema.parse(req.body);
        const userId = req.session.userId;

        const request = await dbGet(
            "SELECT id FROM material_requests WHERE id = ? AND foreman_id = ? AND is_deleted = 0",
            [requestId, userId]
        );

        if (!request) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        await dbRun(
            "UPDATE material_requests SET status = ?, notes = ?, reviewed_at = datetime('now') WHERE id = ?",
            [status, notes || null, requestId]
        );

        res.json({ success: true, message: `Заявка ${status === 'approved' ? 'согласована' : 'отклонена'}` });

    } catch (error) {
        next(error);
    }
};

// Прораб создаёт заявку на дополнительный материал
exports.createMaterialRequest = async (req, res, next) => {
    try {
        const validated = materialRequestSchema.parse(req.body);
        const { projectId, materialName, unit, quantity, reason } = validated;
        const userId = req.session.userId;

        const project = await dbGet(
            "SELECT id, supplier_id FROM projects WHERE id = ? AND foreman_id = ? AND is_deleted = 0",
            [projectId, userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        await dbRun(
            `INSERT INTO material_requests (project_id, foreman_id, supplier_id, material_name, quantity, unit, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [projectId, userId, project.supplier_id, materialName, quantity, unit, reason || 'Запрос от прораба']
        );

        res.json({ success: true, message: "Заявка отправлена снабженцу" });

    } catch (error) {
        next(error);
    }
};

exports.getMaterials = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const materials = await dbAll(
            `SELECT pm.*, ps.name as stage_name, p.title as project_title
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             JOIN projects p ON ps.project_id = p.id
             WHERE p.foreman_id = ? AND pm.is_deleted = 0 AND ps.is_deleted = 0 AND p.is_deleted = 0
             ORDER BY p.id, ps.stage_number, pm.id`,
            [userId]
        );

        res.json({ success: true, materials });
    } catch (error) {
        next(error);
    }
};
