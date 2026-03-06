const { dbGet, dbAll, dbRun } = require('../config/database');
const XLSX = require('xlsx');

exports.joinProject = async (req, res) => {
    try {
        const { accessCode } = req.body;

        const project = await dbGet("SELECT * FROM projects WHERE access_code = ?", [accessCode]);
        if (!project) return res.json({ success: false, message: "Неверный код" });

        if (project.supplier_id && project.supplier_id !== req.session.userId) {
            return res.json({ success: false, message: "У проекта уже есть снабженец" });
        }

        await dbRun("UPDATE projects SET supplier_id = ? WHERE id = ?", [req.session.userId, project.id]);
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
             WHERE p.supplier_id = ?
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );

        res.json({ success: true, projects });
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.getProjectMaterials = async (req, res) => {
    try {
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND supplier_id = ?",
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        const materials = await dbAll(
            `SELECT pm.*, ps.name as stage_name, ps.stage_number
             FROM project_materials pm
             JOIN project_stages ps ON pm.stage_id = ps.id
             WHERE ps.project_id = ?
             ORDER BY ps.stage_number, pm.id`,
            [req.params.id]
        );

        res.json({ success: true, project, materials });
    } catch (error) {
        console.error('Ошибка получения материалов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.exportProjectMaterials = async (req, res) => {
    try {
        const project = await dbGet(
            "SELECT * FROM projects WHERE id = ? AND supplier_id = ?",
            [req.params.id, req.session.userId]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

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

        const worksheet = XLSX.utils.json_to_sheet(materials);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Материалы');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename=materials_project_${req.params.id}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Ошибка экспорта материалов:', error);
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
};

exports.proposeMaterial = async (req, res) => {
    try {
        const { stageId, materialName, unit, quantity, notes } = req.body;

        if (!stageId || !materialName || !quantity) {
            return res.status(400).json({ success: false, message: 'Заполните обязательные поля' });
        }

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
};

exports.getMaterialRequests = async (req, res) => {
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
};

exports.updateMaterialRequestStatus = async (req, res) => {
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
            const stage = await dbGet(
                'SELECT id FROM project_stages WHERE project_id = ? ORDER BY stage_number LIMIT 1',
                [request.project_id]
            );

            if (stage) {
                const exists = await dbGet(
                    'SELECT id FROM project_materials WHERE stage_id = ? AND material_name = ?',
                    [stage.id, request.material_name]
                );

                if (exists) {
                    await dbRun(
                        `UPDATE project_materials 
                         SET quantity_received = quantity_received + ?, is_received = 1, received_at = datetime('now')
                         WHERE id = ?`,
                        [request.quantity, exists.id]
                    );
                } else {
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
};

exports.confirmMaterialDelivery = async (req, res) => {
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
};
