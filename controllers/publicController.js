const { dbRun } = require('../config/database');

exports.createPublicRequest = async (req, res) => {
    try {
        const { fullName, phone, email, organization, description } = req.body;

        if (!fullName || !phone) {
            return res.status(400).json({
                success: false,
                message: "Имя и телефон обязательны"
            });
        }

        if (!/^(\+7|8).*$/.test(phone) || phone.length < 10) {
            return res.status(400).json({
                success: false,
                message: "Некорректный формат телефона"
            });
        }

        const documentPaths = req.files ? req.files.map(f => f.path).join(',') : null;

        await dbRun(
            "INSERT INTO public_requests (full_name, phone, email, organization, description, documents) VALUES (?, ?, ?, ?, ?, ?)",
            [fullName, phone, email || null, organization || null, description || null, documentPaths]
        );

        console.log(`📩 Новая гостевая заявка от ${fullName} (${phone})`);
        res.json({ success: true, message: "Заявка принята" });

    } catch (error) {
        console.error('Ошибка создания гостевой заявки:', error);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
};
