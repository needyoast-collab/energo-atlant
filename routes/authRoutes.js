const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Rate limiting для защиты от брутфорса
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // Строгий лимит: 5 попыток
    skipSuccessfulRequests: true, // Считаем только ошибки (брутфорс)
    standardHeaders: true, // Возвращать RateLimit заголовки
    legacyHeaders: false,
    message: { success: false, message: "🚨 Слишком много неудачных попыток входа. Пожалуйста, подождите 15 минут." }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // Максимум 3 регистрации в час с одного IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "⚠️ Превышен лимит регистраций с вашего IP. Пожалуйста, попробуйте позднее." }
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/register', registerLimiter, authController.register);
router.post('/register/partner', registerLimiter, authController.registerPartner);
router.get('/user/me', requireAuth, authController.getMe);
router.put('/user/password', requireAuth, authController.changePassword);
router.post('/password-reset/request', authController.requestPasswordReset);
router.post('/password-reset/confirm', authController.confirmPasswordReset);

module.exports = router;
