const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Middleware для проверки прав администратора
const requireAdmin = (req, res, next) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: "Доступ запрещен. Только для администраторов." });
    }
    next();
};

router.use(requireAdmin);

router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.post('/users/:id/verify', adminController.verifyUser);

module.exports = router;
