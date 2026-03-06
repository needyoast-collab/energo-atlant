const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { requireCustomer } = require('../middleware/auth');
const upload = require('../config/upload'); // Assuming this exists

router.use(requireCustomer);

router.post('/requests', upload.array('documents', 5), customerController.createRequest);
router.post('/join', customerController.joinProject);
router.get('/projects', customerController.getProjects);
router.get('/projects/:id', customerController.getProjectDetails);
router.get('/requests', customerController.getRequests);

module.exports = router;
