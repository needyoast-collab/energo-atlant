const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { requireAuth } = require('../middleware/auth');

// Защищенный доступ к файлам
router.get('/serve', requireAuth, documentController.serveFile);

module.exports = router;
