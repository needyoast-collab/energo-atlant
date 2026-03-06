const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/:id/documents', projectController.getProjectDocuments);

module.exports = router;
