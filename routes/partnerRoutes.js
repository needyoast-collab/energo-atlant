const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('partner', 'admin'));

router.get('/stats', partnerController.getStats);
router.post('/payout', partnerController.requestPayout);

module.exports = router;
