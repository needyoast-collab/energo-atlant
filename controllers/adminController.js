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

const adminUpdateUserSchema = z.object({
    full_name: z.string().min(2, "ФИО слишком короткое").max(100),
    role: z.enum(['admin', 'manager', 'foreman', 'supplier', 'pto', 'customer', 'partner']),
    is_active: z.number().int().min(0).max(1).optional(),
    is_verified: z.number().int().min(0).max(1).optional(),
    email: z.string().email("Неверный формат email").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal(''))
});

exports.getUsers = async (req, res, next) => {
    try {
        const users = await dbAll(
            "SELECT id, login, email, phone, role, full_name, organization, is_active, is_verified, created_at FROM users WHERE is_deleted = 0 ORDER BY id DESC"
        );
        res.json({ success: true, users });
    } catch (error) {
        next(error);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const parseResult = adminCreateUserSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors?.[0]?.message || "Ошибка валидации"
            });
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
        next(error);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const parseResult = adminUpdateUserSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors?.[0]?.message || "Ошибка валидации"
            });
        }

        const { full_name, role, is_active, is_verified, email, phone } = parseResult.data;

        await dbRun(
            "UPDATE users SET full_name = ?, role = ?, is_active = ?, is_verified = ?, email = ?, phone = ? WHERE id = ?",
            [full_name, role, is_active ?? 1, is_verified ?? 1, email || null, phone || null, userId]
        );

        res.json({ success: true, message: "Данные пользователя обновлены" });
    } catch (error) {
        next(error);
    }
};

exports.verifyUser = async (req, res, next) => {
    try {
        const userId = z.string().or(z.number()).parse(req.params.id);
        await dbRun("UPDATE users SET is_verified = 1 WHERE id = ?", [userId]);
        res.json({ success: true, message: "Пользователь успешно верифицирован" });
    } catch (error) {
        next(error);
    }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const userId = z.coerce.number().parse(req.params.id);
        // Заменяем DELETE на UPDATE для Soft Delete
        await dbRun("UPDATE users SET is_deleted = 1, is_active = 0 WHERE id = ?", [userId]);
        res.json({ success: true, message: "Пользователь удален (Soft Delete)" });
    } catch (error) {
        next(error);
    }
};

exports.getDeletedUsers = async (req, res, next) => {
    try {
        const users = await dbAll(
            "SELECT id, login, email, phone, role, full_name, organization, created_at FROM users WHERE is_deleted = 1 ORDER BY id DESC"
        );
        res.json({ success: true, users });
    } catch (error) {
        next(error);
    }
};

exports.restoreUser = async (req, res, next) => {
    try {
        const userId = z.coerce.number().parse(req.params.id);
        await dbRun("UPDATE users SET is_deleted = 0, is_active = 1 WHERE id = ?", [userId]);
        res.json({ success: true, message: "Пользователь восстановлен" });
    } catch (error) {
        next(error);
    }
};
