const { dbGet, dbAll, dbRun } = require('../config/database');
const { sendDirectNotification } = require('../utils/helpers');
const { z } = require('zod');

const sendMessageSchema = z.object({
    receiver_id: z.coerce.number().positive("Укажите получателя"),
    project_id: z.coerce.number().positive().optional().nullable(),
    subject: z.string().max(200).optional().or(z.literal('')),
    body: z.string().min(1, "Введите текст сообщения").max(2000)
});

exports.getInbox = async (req, res, next) => {
    try {
        const messages = await dbAll(
            `SELECT m.*, u.full_name as sender_name, p.title as project_title
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             LEFT JOIN projects p ON m.project_id = p.id
             WHERE m.receiver_id = ?
             ORDER BY m.created_at DESC`,
            [req.session.userId]
        );
        res.json({ success: true, messages });
    } catch (error) {
        next(error);
    }
};

exports.getSent = async (req, res, next) => {
    try {
        const messages = await dbAll(
            `SELECT m.*, u.full_name as receiver_name, p.title as project_title
             FROM messages m
             JOIN users u ON m.receiver_id = u.id
             LEFT JOIN projects p ON m.project_id = p.id
             WHERE m.sender_id = ?
             ORDER BY m.created_at DESC`,
            [req.session.userId]
        );
        res.json({ success: true, messages });
    } catch (error) {
        next(error);
    }
};

exports.sendMessage = async (req, res, next) => {
    try {
        const parseResult = sendMessageSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
        }

        const { receiver_id, project_id, subject, body } = parseResult.data;

        let attachmentsString = null;
        if (req.files && req.files.length > 0) {
            const filesData = req.files.map(f => ({
                originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
                filename: f.filename,
                size: f.size
            }));
            attachmentsString = JSON.stringify(filesData);
        }

        await dbRun(
            `INSERT INTO messages (sender_id, receiver_id, project_id, subject, body, attachments) VALUES (?, ?, ?, ?, ?, ?)`,
            [req.session.userId, receiver_id, project_id || null, subject || null, body, attachmentsString]
        );

        // Прямое уведомление получателю
        const sender = await dbGet('SELECT full_name FROM users WHERE id = ?', [req.session.userId]);
        await sendDirectNotification(
            receiver_id,
            project_id || null,
            'message',
            `У вас новое сообщение от ${sender ? sender.full_name : 'пользователя'}`
        );

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const messageId = z.coerce.number().parse(req.params.id);
        await dbRun(`UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?`, [messageId, req.session.userId]);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};
