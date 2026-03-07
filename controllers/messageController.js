const { dbGet, dbAll, dbRun } = require('../config/database');
const { sendDirectNotification } = require('../utils/helpers');

exports.getInbox = async (req, res) => {
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
    } catch (e) {
        console.error('Ошибка входящих:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.getSent = async (req, res) => {
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
    } catch (e) {
        console.error('Ошибка исходящих:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.sendMessage = async (req, res) => {
    const { receiver_id, project_id, subject, body } = req.body;
    if (!receiver_id || !body) return res.status(400).json({ success: false, message: 'Обязательные поля не заполнены' });

    try {
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
            [req.session.userId, receiver_id, project_id, subject, body, attachmentsString]
        );

        // Прямое уведомление получателю
        const sender = await dbGet('SELECT full_name FROM users WHERE id = ?', [req.session.userId]);
        await sendDirectNotification(
            receiver_id,
            project_id || null,
            'message',
            `У вас новое непрочитанное входящее сообщение от ${sender ? sender.full_name : 'пользователя'}`
        );

        res.json({ success: true });
    } catch (e) {
        console.error('Ошибка отправки сообщения:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await dbRun(`UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?`, [req.params.id, req.session.userId]);
        res.json({ success: true });
    } catch (e) {
        console.error('Ошибка прочтения:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};
