const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { requireAuth } = require('../middleware/auth');
const upload = require('../config/upload'); // Assuming this exists

router.use(requireAuth);

router.get('/inbox', messageController.getInbox);
router.get('/sent', messageController.getSent);
router.post('/', upload.array('attachments', 5), messageController.sendMessage);
router.put('/:id/read', messageController.markAsRead);

module.exports = router;
