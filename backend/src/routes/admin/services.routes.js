const { Router } = require('express');
const ctrl = require('../../controllers/admin/services.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/service-categories', adminHandler(ctrl.listCategories));
router.post('/service-categories', adminHandler(ctrl.createCategory));
router.put('/service-categories/:id', adminHandler(ctrl.updateCategory));
router.delete('/service-categories/:id', adminHandler(ctrl.deleteCategory));

router.get('/services', adminHandler(ctrl.list));
router.post('/services', adminHandler(ctrl.create));
router.put('/services/:id', adminHandler(ctrl.update));
router.delete('/services/:id', adminHandler(ctrl.remove));

router.get('/services/:id/samagri', adminHandler(ctrl.listSamagri));
router.post('/services/:id/samagri', adminHandler(ctrl.addSamagri));

module.exports = router;
