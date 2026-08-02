const { Router } = require('express');
const ctrl = require('../../controllers/admin/temples.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.post('/', adminHandler(ctrl.create));
router.get('/:id', adminHandler(ctrl.getById));
router.put('/:id', adminHandler(ctrl.update));
router.delete('/:id', adminHandler(ctrl.deactivate));
router.put('/:id/timings', adminHandler(ctrl.setTimings));
router.post('/:id/pandits', adminHandler(ctrl.mapPandit));

module.exports = router;
