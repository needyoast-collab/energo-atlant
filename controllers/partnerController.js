const { dbGet, dbRun, dbAll } = require('../config/database');

// === СТАТИСТИКА ПАРТНЁРА ===
exports.getStats = async (req, res) => {
    try {
        const partnerId = req.session.userId;

        // Получаем info партнёра с ref_code
        const partner = await dbGet(
            'SELECT id, full_name, organization, ref_code, partner_level, created_at FROM users WHERE id = ?',
            [partnerId]
        );

        if (!partner) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

        // Если ref_code ещё нет — генерируем и сохраняем
        if (!partner.ref_code) {
            const code = 'EA' + partnerId + Math.random().toString(36).substring(2, 6).toUpperCase();
            await dbRun('UPDATE users SET ref_code = ? WHERE id = ?', [code, partnerId]);
            partner.ref_code = code;
        }

        // Привлечённые клиенты
        const clients = await dbAll(
            `SELECT rc.id, rc.referred_user_id, rc.created_at, rc.status, rc.commission_amount,
                    u.full_name, u.organization, u.created_at as user_since
             FROM referral_clients rc
             JOIN users u ON rc.referred_user_id = u.id
             WHERE rc.partner_id = ?
             ORDER BY rc.created_at DESC`,
            [partnerId]
        );

        // Финансы
        const finance = await dbGet(
            `SELECT 
                COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_amount,
                COUNT(*) as total_deals
             FROM referral_clients WHERE partner_id = ?`,
            [partnerId]
        );

        // История выплат
        const payouts = await dbAll(
            `SELECT * FROM partner_payouts WHERE partner_id = ? ORDER BY created_at DESC LIMIT 20`,
            [partnerId]
        );

        // Уровень партнёра
        const clientCount = clients.length;
        let level = { name: 'Старт', commission: 7.5, next: 'Базовый (10%)', needed: Math.max(0, 3 - clientCount) };
        if (clientCount >= 10) level = { name: 'Эксперт', commission: 15, next: null, needed: 0 };
        else if (clientCount >= 5) level = { name: 'Про', commission: 12, next: 'Эксперт (15%)', needed: 10 - clientCount };
        else if (clientCount >= 3) level = { name: 'Базовый', commission: 10, next: 'Про (12%)', needed: 5 - clientCount };

        res.json({
            success: true,
            partner: {
                ...partner,
                level,
                clients_count: clientCount
            },
            clients,
            finance: finance || { total_paid: 0, pending_amount: 0, total_deals: 0 },
            payouts
        });
    } catch (error) {
        console.error('partnerController.getStats error:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// === ЗАПРОС НА ВЫПЛАТУ ===
exports.requestPayout = async (req, res) => {
    try {
        const partnerId = req.session.userId;
        const { amount, payment_details } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Укажите корректную сумму' });
        }
        if (!payment_details) {
            return res.status(400).json({ success: false, message: 'Укажите реквизиты для выплаты' });
        }

        // Проверяем доступный баланс
        const finance = await dbGet(
            `SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as available
             FROM referral_clients WHERE partner_id = ?`,
            [partnerId]
        );

        if (finance.available < amount) {
            return res.status(400).json({ success: false, message: `Недостаточно средств. Доступно: ${finance.available} ₽` });
        }

        await dbRun(
            `INSERT INTO partner_payouts (partner_id, amount, payment_details, status) VALUES (?, ?, ?, 'pending')`,
            [partnerId, amount, payment_details]
        );

        res.json({ success: true, message: 'Запрос на выплату отправлен. Обработка 1-3 рабочих дня.' });
    } catch (error) {
        console.error('partnerController.requestPayout error:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// === РЕГИСТРАЦИЯ РЕФЕРАЛА (вызывается при регистрации клиента с ref-кодом) ===
exports.registerReferral = async (partnerId, newUserId) => {
    try {
        await dbRun(
            `INSERT OR IGNORE INTO referral_clients (partner_id, referred_user_id, status, commission_amount) VALUES (?, ?, 'pending', 0)`,
            [partnerId, newUserId]
        );
    } catch (e) {
        console.error('registerReferral error:', e);
    }
};
