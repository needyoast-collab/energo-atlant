const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', notificationController.getNotifications);
router.post('/read/:id', notificationController.markAsRead);
router.post('/read-project/:id', notificationController.markProjectNotificationsAsRead);

module.exports = router;
