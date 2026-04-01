const { dbGet } = require('../config/database');
const { getPresignedUrl: getSignedUrl } = require('../utils/s3Storage');
const path = require('path');
const fs = require('fs');

/**
 * Контроллер для защищенного доступа к документам и фото
 * Интегрирован с Supabase Storage
 */
exports.serveFile = async (req, res, next) => {
    try {
        const filePath = req.query.path;
        if (!filePath) {
            return res.status(400).json({ success: false, message: "Путь к файлу не указан" });
        }

        const userId = req.session.userId;
        const userRole = req.session.userRole;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Авторизуйтесь" });
        }

        // --- 1. ПРОВЕРКА ПРАВ (Принцип RLS) ---
        let hasAccess = (userRole === 'admin');

        if (!hasAccess) {
            // а) Проверяем таблицу project_documents
            const docRecord = await dbGet(`
                SELECT pd.id, p.manager_id, p.foreman_id, p.customer_id, p.pto_id, p.supplier_id
                FROM project_documents pd
                JOIN projects p ON pd.project_id = p.id
                WHERE pd.file_path = ?
            `, [filePath]);

            if (docRecord) {
                const participants = [docRecord.manager_id, docRecord.foreman_id, docRecord.customer_id, docRecord.pto_id, docRecord.supplier_id];
                if (participants.includes(userId)) hasAccess = true;
            }
        }

        if (!hasAccess) {
            // б) Проверяем таблицу project_stage_photos
            const photoRecord = await dbGet(`
                SELECT psp.id, p.manager_id, p.foreman_id, p.customer_id
                FROM project_stage_photos psp
                JOIN project_stages ps ON psp.stage_id = ps.id
                JOIN projects p ON ps.project_id = p.id
                WHERE psp.file_path = ?
            `, [filePath]);

            if (photoRecord) {
                const participants = [photoRecord.manager_id, photoRecord.foreman_id, photoRecord.customer_id];
                if (participants.includes(userId)) hasAccess = true;
            }
        }

        // Дополнительные проверки (заявки, сообщения) можно добавить аналогично...

        if (!hasAccess) {
            console.warn(`🛑 Попытка несанкционированного доступа к файлу: ${filePath} пользователем ID ${userId}`);
            return res.status(403).json({ success: false, message: "Доступ запрещен" });
        }

        // --- 2. ВЫДАЧА ФАЙЛА ---

        // Если файл локальный (legacy путь начинается с 'uploads')
        if (filePath.startsWith('uploads/')) {
            const absolutePath = path.join(process.cwd(), filePath);
            if (fs.existsSync(absolutePath)) {
                return res.sendFile(absolutePath);
            }
        }

        // Если файл в облаке Supabase
        const signedUrl = await getSignedUrl(filePath);
        if (signedUrl) {
            return res.redirect(signedUrl);
        }

        res.status(404).json({ success: false, message: "Файл не найден" });

    } catch (error) {
        next(error);
    }
};
