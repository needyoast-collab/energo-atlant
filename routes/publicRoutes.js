const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const upload = require('../config/upload'); // Assuming this exists

router.post('/request', upload.array('documents', 10), publicController.createPublicRequest);

module.exports = router;
