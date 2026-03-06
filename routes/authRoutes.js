const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Rate limiting для защиты от брутфорса
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 10, // Строгий лимит на 10 попыток
    skipSuccessfulRequests: true, // НЕ считать успешные попытки
    message: { success: false, message: "Слишком много попыток входа. Попробуйте позже." }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5, // Не более 5 регистраций в час с одного IP
    message: { success: false, message: "Превышен лимит регистраций. Попробуйте позже." }
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/register', registerLimiter, authController.register);
router.get('/user/me', requireAuth, authController.getMe);

module.exports = router;
