const { dbGet } = require('../config/database');
const path = require('path');
const fs = require('fs');

/**
 * Контроллер для защищенного доступа к документам и фото
 * Заменяет express.static('/uploads') для защиты коммерческой тайны
 */
exports.serveFile = async (req, res, next) => {
    try {
        const filePath = req.query.path;
        if (!filePath) {
            return res.status(400).json({ success: false, message: "Путь к файлу не указан" });
        }

        // 1. Защита от Path Traversal
        // Разрешаем только файлы внутри папки uploads
        const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
        if (normalizedPath !== filePath || !filePath.startsWith('uploads')) {
            return res.status(403).json({ success: false, message: "Доступ к этой директории запрещен" });
        }

        const absolutePath = path.join(process.cwd(), filePath);

        // Проверка физического существования файла
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: "Файл не найден на сервере" });
        }

        // 2. Проверка прав доступа пользователя к файлу через БД (Принцип RLS)
        const userId = req.session.userId;
        const userRole = req.session.userRole;

        // Админ имеет доступ ко всему
        if (userRole === 'admin') {
            return res.sendFile(absolutePath);
        }

        // Пытаемся найти связь файла с проектом, к которому у пользователя есть доступ

        // а) Проверяем таблицу project_documents
        const docRecord = await dbGet(`
            SELECT pd.id, p.manager_id, p.foreman_id, p.customer_id, p.pto_id, p.supplier_id
            FROM project_documents pd
            JOIN projects p ON pd.project_id = p.id
            WHERE pd.file_path = ?
        `, [filePath]);

        if (docRecord) {
            const participants = [docRecord.manager_id, docRecord.foreman_id, docRecord.customer_id, docRecord.pto_id, docRecord.supplier_id];
            if (participants.includes(userId)) {
                return res.sendFile(absolutePath);
            }
        }

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
            if (participants.includes(userId)) {
                return res.sendFile(absolutePath);
            }
        }

        // в) Проверяем таблицу project_requests (могут быть документы в заявках)
        // В БД они хранятся как строка путей через запятую
        const requestRecord = await dbGet(`
            SELECT id FROM project_requests
            WHERE (customer_id = ? OR reviewer_id IS NOT NULL) 
            AND documents LIKE ?
        `, [userId, `%${filePath}%`]);

        if (requestRecord) {
            return res.sendFile(absolutePath);
        }

        // г) Проверяем таблицу messages (вложения в сообщениях)
        const fileNameOnly = filePath.split('/').pop();
        const msgRecord = await dbGet(`
            SELECT id FROM messages
            WHERE (sender_id = ? OR receiver_id = ?) 
            AND attachments LIKE ?
        `, [userId, userId, `%${fileNameOnly}%`]);

        if (msgRecord) {
            return res.sendFile(absolutePath);
        }

        // Если нигде не нашли или доступ не подтвержден
        console.warn(`🛑 Попытка несанкционированного доступа к файлу: ${filePath} пользователем ID ${userId}`);
        return res.status(403).json({ success: false, message: "У вас нет прав на просмотр этого файла" });

    } catch (error) {
        next(error);
    }
};
