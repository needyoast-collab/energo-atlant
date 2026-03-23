const { dbAll, dbGet, dbRun } = require('../config/database');
const argon2 = require('argon2');
const { z } = require('zod');

const adminCreateUserSchema = z.object({
    login: z.string().trim().min(3, "Логин должен быть от 3 символа").max(50),
    password: z.string().min(6, "Пароль должен быть от 6 символов").max(100),
    role: z.enum(['admin', 'manager', 'foreman', 'supplier', 'pto', 'customer', 'partner']),
    full_name: z.string().trim().min(2, "ФИО слишком короткое").max(100),
    email: z.preprocess(val => (val === '' || val === null) ? undefined : val, z.string().email("Неверный формат email").optional()),
    phone: z.preprocess(val => (val === '' || val === null) ? undefined : val, z.string().regex(/^[\+]?[78][\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}$/, "Неверный формат телефона").optional()),
    organization: z.preprocess(val => (val === '' || val === null) ? undefined : val, z.string().max(100).optional()),
});

const adminUpdateUserSchema = z.object({
    full_name: z.string().min(2, "ФИО слишком короткое").max(100),
    role: z.enum(['admin', 'manager', 'foreman', 'supplier', 'pto', 'customer', 'partner']),
    is_active: z.number().int().min(0).max(1).optional(),
    is_verified: z.number().int().min(0).max(1).optional(),
    email: z.preprocess(val => (val === '' || val === null) ? undefined : val, z.string().email("Неверный формат email").optional()),
    phone: z.preprocess(val => (val === '' || val === null) ? undefined : val, z.string().optional()),
    password: z.string().min(4, "Пароль слишком короткий").optional() // Опциональное обновление пароля
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

        // Проверка уникальности по login, email и phone
        const existingUser = await dbGet("SELECT id, login, email, phone FROM users WHERE (login = ? OR email = ? OR phone = ?) AND is_deleted = 0", 
            [login, email || null, phone || null]);
        if (existingUser) {
            if (existingUser.login === login) {
                return res.status(400).json({ success: false, message: "Пользователь с таким логином уже существует" });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ success: false, message: "Пользователь с таким email уже существует" });
            }
            if (existingUser.phone === phone) {
                return res.status(400).json({ success: false, message: "Пользователь с таким телефоном уже существует" });
            }
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
        const userId = z.coerce.number().parse(req.params.id);
        const parseResult = adminUpdateUserSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors?.[0]?.message || "Ошибка валидации"
            });
        }

        const { full_name, role, is_active, is_verified, email, phone, password } = parseResult.data;

        // Если передан пароль - хешируем его
        let updateFields = "full_name = ?, role = ?, is_active = ?, is_verified = ?, email = ?, phone = ?";
        let updateValues = [full_name, role, is_active ?? 1, is_verified ?? 1, email || null, phone || null];
        
        if (password) {
            const hashedPassword = await argon2.hash(password);
            updateFields += ", password = ?";
            updateValues.push(hashedPassword);
        }
        
        updateValues.push(userId);

        await dbRun(`UPDATE users SET ${updateFields} WHERE id = ?`, updateValues);

        res.json({ success: true, message: "Данные пользователя обновлены" });
    } catch (error) {
        next(error);
    }
};

exports.verifyUser = async (req, res, next) => {
    try {
        const userId = z.coerce.number().parse(req.params.id);
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
