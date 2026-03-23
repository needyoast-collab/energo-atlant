const { dbRun, dbAll } = require('../config/database');
const { z } = require('zod');
const { sendDirectNotification } = require('../utils/helpers');

const publicRequestSchema = z.object({
    fullName: z.string().trim().min(2, "Имя слишком короткое (минимум 2 буквы)").max(100),
    phone: z.string().trim().min(10, "Введите корректный номер телефона"),
    email: z.preprocess(val => (val === '' || val === null) ? undefined : val,
        z.string().email("Неверный формат email").optional()),
    organization: z.preprocess(val => (val === '' || val === null) ? undefined : val,
        z.string().max(100).optional()),
    description: z.preprocess(val => (val === '' || val === null) ? undefined : val,
        z.string().max(1000).optional())
});

exports.createPublicRequest = async (req, res, next) => {
    try {
        const parseResult = publicRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            console.log('Public Request Validation Error:', parseResult.error.errors);
            return res.status(400).json({ success: false, message: parseResult.error.errors?.[0]?.message || 'Ошибка валидации' });
        }

        const { fullName, phone, email, organization, description } = parseResult.data;
        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO public_requests (full_name, phone, email, organization, description, documents) VALUES (?, ?, ?, ?, ?, ?)",
            [fullName, phone, email || null, organization || null, description || null, documentPaths]
        );

        // Отправляем уведомления менеджерам
        try {
            const managers = await dbAll("SELECT id FROM users WHERE role = 'manager' AND is_active = 1 AND is_deleted = 0");
            const notifMsg = `Новая гостевая заявка от ${fullName}`;
            for (const mgr of managers) {
                await sendDirectNotification(mgr.id, null, 'new_public_request', notifMsg);
            }
        } catch (e) {
            console.warn('Не удалось отправить уведомление менеджерам:', e);
        }

        res.json({ success: true, message: "Заявка успешно отправлена! Мы свяжемся с вами в ближайшее время." });
    } catch (error) {
        next(error);
    }
};
