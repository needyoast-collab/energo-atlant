const { dbAll, dbGet, dbRun } = require('../config/database');
const argon2 = require('argon2');
const { z } = require('zod');

const adminCreateUserSchema = z.object({
    login: z.string().min(3, "Логин должен быть от 3 символов").max(50),
    password: z.string().min(6, "Пароль должен быть от 6 символов"),
    role: z.enum(['admin', 'manager', 'foreman', 'supplier', 'pto', 'customer', 'partner']),
    full_name: z.string().min(2, "ФИО слишком короткое").max(100),
    email: z.string().email("Неверный формат email").optional().or(z.literal('')),
    phone: z.string().regex(/^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, "Неверный формат телефона").optional().or(z.literal('')),
    organization: z.string().max(100).optional().or(z.literal(''))
});

exports.getUsers = async (req, res) => {
    try {
        const users = await dbAll(
            "SELECT id, login, email, phone, role, full_name, organization, is_active, is_verified, created_at FROM users ORDER BY id DESC"
        );
        res.json({ success: true, users });
    } catch (error) {
        console.error('Ошибка получения списка пользователей:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.createUser = async (req, res) => {
    try {
        const parseResult = adminCreateUserSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
        }

        const { login, password, email, phone, role, full_name, organization } = parseResult.data;

        const existingUser = await dbGet("SELECT id FROM users WHERE login = ?", [login]);
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Пользователь с таким логином уже существует" });
        }

        const hashedPassword = await argon2.hash(password);

        await dbRun(
            `INSERT INTO users (login, password, email, phone, role, full_name, organization, is_verified) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [login, hashedPassword, email || null, phone || null, role, full_name, organization || null]
        );

        res.json({ success: true, message: "Пользователь успешно создан" });
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { full_name, role, is_active, email } = req.body;

        if (!full_name || !role) {
            return res.status(400).json({ success: false, message: "Заполните обязательные поля ФИО и Роль" });
        }

        // Обновляем данные (включая is_verified и email, если передали)
        await dbRun(
            "UPDATE users SET full_name = ?, role = ?, is_active = ?, is_verified = COALESCE(?, is_verified), email = ? WHERE id = ?",
            [full_name, role, is_active !== undefined ? is_active : 1, req.body.is_verified, email || null, userId]
        );

        res.json({ success: true, message: "Данные пользователя обновлены" });
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};

exports.verifyUser = async (req, res) => {
    try {
        await dbRun("UPDATE users SET is_verified = 1 WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Пользователь успешно верифицирован" });
    } catch (error) {
        console.error('Ошибка верификации пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
