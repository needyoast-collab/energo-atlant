const { dbRun, dbAll } = require('../config/database');

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await dbAll(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.session.userId]
        );
        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Ошибка получения уведомлений:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [req.params.id, req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отметки уведомления:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.markProjectNotificationsAsRead = async (req, res) => {
    try {
        const { type } = req.body;
        if (!type || (type !== 'photo' && type !== 'document')) {
            return res.status(400).json({ success: false, message: "Неверный тип уведомления" });
        }
        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE project_id = ? AND user_id = ? AND type = ?`,
            [req.params.id, req.session.userId, type]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка очистки уведомлений проекта:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
