const { dbGet, dbAll } = require('../config/database');
const { z } = require('zod');

exports.getProjectDocuments = async (req, res) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        
        // Проверка доступа к проекту (Защита от IDOR)
        const project = await dbGet(
            `SELECT id FROM projects WHERE id = ? AND (
                manager_id = ? OR foreman_id = ? OR supplier_id = ? OR pto_id = ? OR customer_id = ? OR ? = 'admin'
            )`,
            [
                projectId,
                req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId,
                req.session.userRole
            ]
        );

        if (!project) {
            return res.status(403).json({ success: false, message: "Доступ к документам проекта запрещен" });
        }

        const documents = await dbAll(
            "SELECT * FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC",
            [projectId]
        );

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Ошибка получения документов:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
