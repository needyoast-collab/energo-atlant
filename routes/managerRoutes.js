const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');
const upload = require('../config/upload'); // Assuming upload is configured and exported from there
const { requireManagerOrAdmin } = require('../middleware/auth');

router.use(requireManagerOrAdmin);

router.get('/staff', managerController.getStaff);
router.post('/projects', upload.array('documents', 10), managerController.createProject);
router.post('/ai-analyze', upload.single('document'), managerController.aiAnalyze);
router.post('/projects/:id/apply-ai-estimate', managerController.applyAiEstimate);
router.get('/projects', managerController.getProjects);
router.put('/projects/:id', managerController.updateProject);
router.put('/projects/:id/complete', upload.single('act'), managerController.completeProject);
router.get('/projects/:id/documents', managerController.getProjectDocuments);
router.post('/projects/:id/documents', upload.single('document'), managerController.uploadProjectDocument);
router.get('/requests', managerController.getRequests);
router.get('/requests/archive', managerController.getRequestArchive);
router.put('/requests/:id', managerController.reviewRequest);

module.exports = router;
