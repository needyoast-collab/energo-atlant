const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { requireSupplier } = require('../middleware/auth');

router.use(requireSupplier);

router.post('/join', supplierController.joinProject);
router.get('/projects', supplierController.getProjects);
router.get('/projects/:id/materials', supplierController.getProjectMaterials);
router.get('/projects/:id/materials/export', supplierController.exportProjectMaterials);
router.get('/projects/:id', supplierController.getProjectDetails);
router.post('/materials', supplierController.proposeMaterial);
router.get('/material-requests', supplierController.getMaterialRequests);
router.put('/material-requests/:id', supplierController.updateMaterialRequestStatus);
router.put('/materials/:id/deliver', supplierController.confirmMaterialDelivery);

module.exports = router;
