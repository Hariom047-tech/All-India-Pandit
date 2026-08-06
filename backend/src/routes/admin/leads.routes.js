const { Router } = require('express');
const ctrl = require('../../controllers/admin/leads.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/settings', adminHandler(ctrl.getSettings));
router.put('/settings', adminHandler(ctrl.saveSettings));
router.get('/overview', adminHandler(ctrl.overview));

module.exports = router;
