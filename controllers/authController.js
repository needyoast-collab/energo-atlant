const { dbGet, dbRun } = require('../config/database');
const argon2 = require('argon2');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { sanitizeUser } = require('../utils/helpers');

const loginSchema = z.object({
    login: z.string().min(1, "Введите логин"),
    password: z.string().min(1, "Введите пароль")
});

const registerSchema = z.object({
    login: z.string().min(3, "Логин должен быть от 3 символов").max(50),
    password: z.string().min(6, "Пароль должен быть от 6 символов"),
    email: z.string().email("Неверный формат email").optional().or(z.literal('')),
    phone: z.string().regex(/^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, "Неверный формат телефона").optional().or(z.literal('')),
    fullName: z.string().min(2, "ФИО слишком короткое").max(100),
    organization: z.string().max(100).optional().or(z.literal('')),
    refCode: z.string().optional()
});

exports.login = async (req, res) => {
    try {
        const parseResult = loginSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors[0].message
            });
        }
        const { login, password } = parseResult.data;

        // Поиск по логину, email или телефону
        const user = await dbGet(
            "SELECT * FROM users WHERE (login = ? OR email = ? OR phone = ?) AND is_active = 1",
            [login, login, login]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // --- ПРОВЕРКА ВЕРИФИКАЦИИ ---
        // Админ пускаем всегда, остальных только если is_verified = 1
        if (user.role !== 'admin' && user.is_verified === 0) {
            return res.status(403).json({
                success: false,
                message: "Ваш аккаунт находится на модерации. Ожидайте подтверждения."
            });
        }

        // === НАЧАЛО ИЗМЕНЕНИЙ: ГИБРИДНАЯ ПРОВЕРКА ===
        let passwordMatch = false;

        // 1. Если хеш Argon2
        if (user.password.startsWith('$argon2')) {
            try {
                passwordMatch = await argon2.verify(user.password, password);
            } catch (err) { }
        }
        // 3. Если старый хеш Bcrypt (мигрируем бесшовно)
        else {
            try {
                passwordMatch = await bcrypt.compare(password, user.password);
                if (passwordMatch) {
                    const newHash = await argon2.hash(password);
                    await dbRun("UPDATE users SET password = ? WHERE id = ?", [newHash, user.id]);
                    console.log(`✅ Пользователь ${user.login} мигрирован на Argon2`);
                }
            } catch (err) { }
        }
        // === КОНЕЦ ИЗМЕНЕНИЙ ===

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Неверный логин или пароль"
            });
        }

        // Сохранение сессии
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userName = user.full_name;
        req.session.userLogin = user.login;

        console.log(`✅ Вход выполнен: ${user.login} (${user.role})`);

        res.json({
            success: true,
            role: user.role,
            user: sanitizeUser(user)
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: "Осуществлен выход" });
    });
};

exports.register = async (req, res) => {
    try {
        const parseResult = registerSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: parseResult.error.errors[0].message
            });
        }
        const { login, password, email, phone, fullName, organization, refCode } = parseResult.data;

        // Проверка существования
        const existing = await dbGet(
            "SELECT id FROM users WHERE login = ? OR email = ? OR phone = ?",
            [login, email, phone]
        );

        if (existing) {
            return res.json({
                success: false,
                message: "Пользователь с такими данными уже существует"
            });
        }

        // Подтверждаем наличие партнёра по refCode (если передан)
        let partnerId = null;
        if (refCode) {
            const partner = await dbGet("SELECT id FROM users WHERE ref_code = ? AND role = 'partner'", [refCode]);
            if (partner) partnerId = partner.id;
        }

        // Хеширование пароля
        const hashedPassword = await argon2.hash(password);

        // Создание пользователя
        const userRes = await dbRun(
            "INSERT INTO users (login, password, email, phone, full_name, organization, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, 'customer', 0)",
            [login, hashedPassword, email, phone, fullName, organization]
        );

        // Если есть партнёр — привязываем клиента
        if (partnerId && userRes.id) {
            await dbRun(
                "INSERT INTO referral_clients (partner_id, referred_user_id, status, commission_amount) VALUES (?, ?, 'pending', 0)",
                [partnerId, userRes.id]
            );
            console.log(`🔗 Клиент ${login} привязан к партнёру ID ${partnerId}`);
        }

        console.log(`✅ Регистрация: ${login} (Ожидает верификации)`);

        res.json({ success: true, message: "Регистрация успешна" });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await dbGet(
            "SELECT id, login, email, phone, role, full_name, organization FROM users WHERE id = ?",
            [req.session.userId]
        );

        res.json({ success: true, user });
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
