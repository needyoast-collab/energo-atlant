const express = require('express');
const router = express.Router();
const ptoController = require('../controllers/ptoController');
const { requirePTO } = require('../middleware/auth');
const upload = require('../config/upload'); // Assuming this exists

router.use(requirePTO);

router.post('/join', ptoController.joinProject);
router.get('/projects', ptoController.getProjects);
router.get('/projects/:id', ptoController.getProjectDetails);
router.post('/projects/:id/documents', upload.array('documents', 10), ptoController.uploadExecutiveDocuments);

module.exports = router;
