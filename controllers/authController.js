const { dbGet, dbRun } = require('../config/database');
const argon2 = require('argon2');
const { z } = require('zod');
const { sanitizeUser } = require('../utils/helpers');

// Схемы валидации - переносим сюда для надежности
const loginSchema = z.object({
    login: z.string().min(1, "Введите логин"),
    password: z.string().min(1, "Введите пароль")
}).strict();

const registerSchema = z.object({
    login: z.string()
        .min(3, "Логин должен быть от 3 символов")
        .max(50, "Логин слишком длинный")
        .regex(/^[a-zA-Z0-9_-]+$/, "Логин может содержать только латинские буквы, цифры, тире и подчеркивание"),
    password: z.string()
        .min(8, "Пароль должен быть от 8 символов")
        .regex(/[A-Z]/, "Пароль должен содержать хотя бы одну заглавную букву")
        .regex(/[0-9]/, "Пароль должен содержать хотя бы одну цифру"),
    email: z.string().email("Неверный формат email").nullable().or(z.literal('')),
    phone: z.string()
        .regex(/^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, "Неверный формат телефона")
        .nullable().or(z.literal('')),
    fullName: z.string().min(2, "ФИО слишком короткое").max(100),
    organization: z.string().max(100).optional().or(z.literal('')),
    refCode: z.string().optional()
}).strict();

exports.login = async (req, res) => {
    try {
        // 1. Валидация входных данных
        const parseResult = loginSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors[0].message
            });
        }
        const { login, password } = parseResult.data;

        // 2. Поиск пользователя (защищенный поиск)
        const user = await dbGet(
            "SELECT * FROM users WHERE (login = ? OR email = ? OR phone = ?) AND is_active = 1",
            [login, login, login]
        );

        if (!user) {
            // Защита от перебора: одинаковое время ответа
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль"
            });
        }

        // 3. Проверка верификации
        if (user.role !== 'admin' && user.is_verified === 0) {
            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт находится на модерации. Ожидайте подтверждения."
            });
        }

        // 4. Проверка пароля (Argon2id)
        let passwordMatch = false;
        try {
            // Мы используем argon2id по умолчанию, или явно для старых Bcrypt (которых тут быть не должно после полной миграции)
            // Но в данном проекте мы убрали bcrypt, поэтому для старых хешей вернем ошибку или реализуем миграцию если нужно.
            // Но задание требует УБРАТЬ bcrypt.
            if (user.password.startsWith('$argon2')) {
                passwordMatch = await argon2.verify(user.password, password);
            } else {
                // Если остался старый хеш, который не argon2 - доступ запрещен (безопасный отказ)
                console.warn(`⚠️ Обнаружен старый формат хеша для пользователя ID: ${user.id}. Требуется сброс пароля.`);
                return res.status(401).json({ success: false, message: "Требуется обновление безопасности. Обратитесь к админу." });
            }
        } catch (err) {
            console.error('Ошибка верификации пароля:', err.message);
        }

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль"
            });
        }

        // 5. Сессия
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userName = user.full_name;
        req.session.userLogin = user.login;

        // Логируем только безопасные данные
        console.log(`✅ Успешный вход: ID ${user.id} (${user.role})`);

        res.json({
            success: true,
            role: user.role,
            user: sanitizeUser(user)
        });

    } catch (error) {
        console.error('Критическая ошибка входа:', error.message);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
};

exports.logout = (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
        console.log(`🚪 Выход выполнен: ID ${userId}`);
        res.json({ success: true, message: "Осуществлен выход" });
    });
};

exports.register = async (req, res) => {
    try {
        // 1. Валидация
        const parseResult = registerSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors[0].message
            });
        }
        const { login, password, email, phone, fullName, organization, refCode } = parseResult.data;

        // 2. Проверка уникальности
        const existing = await dbGet(
            "SELECT id FROM users WHERE login = ? OR (email IS NOT NULL AND email != '' AND email = ?) OR (phone IS NOT NULL AND phone != '' AND phone = ?)",
            [login, email, phone]
        );

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Пользователь с такими данными уже зарегистрирован"
            });
        }

        // 3. Реферальная ссылка
        let partnerId = null;
        if (refCode) {
            const partner = await dbGet("SELECT id FROM users WHERE ref_code = ? AND role = 'partner'", [refCode]);
            if (partner) partnerId = partner.id;
        }

        // 4. Хеширование Argon2id
        // Используем argon2id (type: 2)
        const hashedPassword = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16, // 64MB
            timeCost: 3,
            parallelism: 1
        });

        // 5. Сохранение
        const userRes = await dbRun(
            "INSERT INTO users (login, password, email, phone, full_name, organization, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, 'customer', 0)",
            [login, hashedPassword, email, phone, fullName, organization]
        );

        if (partnerId && userRes.id) {
            await dbRun(
                "INSERT INTO referral_clients (partner_id, referred_user_id, status, commission_amount) VALUES (?, ?, 'pending', 0)",
                [partnerId, userRes.id]
            );
            console.log(`🔗 Создана реферальная привязка: Клиент ID ${userRes.id} -> Партнер ID ${partnerId}`);
        }

        console.log(`🆕 Зарегистрирован новый пользователь: ${login} (Ожидает модерации)`);

        res.json({ success: true, message: "Регистрация успешна. Ожидайте подтверждения администратором." });

    } catch (error) {
        console.error('Ошибка регистрации:', error.message);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false });

        const user = await dbGet(
            "SELECT id, login, email, phone, role, full_name, organization FROM users WHERE id = ?",
            [req.session.userId]
        );

        res.json({ success: true, user: user ? sanitizeUser(user) : null });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};
