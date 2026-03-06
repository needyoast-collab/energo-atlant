const express = require('express');
const router = express.Router();
const foremanController = require('../controllers/foremanController');
const { requireForeman } = require('../middleware/auth');
const upload = require('../config/upload'); // Assuming this exists

router.use(requireForeman);

router.post('/join', foremanController.joinProject);
router.get('/projects', foremanController.getProjects);
router.get('/projects/:id', foremanController.getProjectDetails);
router.post('/stages', foremanController.createStage);
router.put('/materials/:id/usage', foremanController.updateMaterialUsage);
router.post('/stages/:id/photos', upload.array('photos', 10), foremanController.uploadStagePhotos);
router.put('/stages/:id/complete', foremanController.completeStage);
router.get('/material-requests', foremanController.getMaterialRequests);
router.put('/material-requests/:id', foremanController.reviewMaterialRequest);
router.post('/material-requests', foremanController.createMaterialRequest);
router.get('/materials', foremanController.getMaterials);

module.exports = router;
