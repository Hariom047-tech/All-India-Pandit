const { Router } = require('express');
const ctrl = require('../../controllers/admin/panchang.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/panchang', adminHandler(ctrl.list));
router.post('/panchang', adminHandler(ctrl.create));
router.put('/panchang/:id', adminHandler(ctrl.update));

router.get('/festivals', adminHandler(ctrl.listFestivals));
router.post('/festivals', adminHandler(ctrl.createFestival));
router.put('/festivals/:id', adminHandler(ctrl.updateFestival));
router.delete('/festivals/:id', adminHandler(ctrl.deleteFestival));

module.exports = router;
