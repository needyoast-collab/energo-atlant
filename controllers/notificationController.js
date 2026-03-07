const { dbRun, dbAll } = require('../config/database');
const { z } = require('zod');

exports.getNotifications = async (req, res, next) => {
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
        next(error);
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const notificationId = z.coerce.number().parse(req.params.id);
        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [notificationId, req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

exports.markProjectNotificationsAsRead = async (req, res, next) => {
    try {
        const projectId = z.coerce.number().parse(req.params.id);
        const { type } = z.object({ type: z.enum(['photo', 'document', 'status_change', 'message']) }).parse(req.body);

        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE project_id = ? AND user_id = ? AND type = ?`,
            [projectId, req.session.userId, type]
        );
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};
