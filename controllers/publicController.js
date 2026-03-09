const { dbRun } = require('../config/database');
const { z } = require('zod');

const publicRequestSchema = z.object({
    fullName: z.string().min(2, "Имя слишком короткое").max(100),
    phone: z.string().regex(/^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, "Неверный формат телефона"),
    email: z.string().email("Неверный формат email").optional().or(z.literal('')),
    organization: z.string().max(100).optional().or(z.literal('')),
    description: z.string().max(1000).optional().or(z.literal(''))
});

exports.createPublicRequest = async (req, res, next) => {
    try {
        const parseResult = publicRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors?.[0]?.message || 'Ошибка валидации' });
        }

        const { fullName, phone, email, organization, description } = parseResult.data;
        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO public_requests (full_name, phone, email, organization, description, documents) VALUES (?, ?, ?, ?, ?, ?)",
            [fullName, phone, email || null, organization || null, description || null, documentPaths]
        );

        res.json({ success: true, message: "Заявка успешно отправлена! Мы свяжемся с вами в ближайшее время." });
    } catch (error) {
        next(error);
    }
};
