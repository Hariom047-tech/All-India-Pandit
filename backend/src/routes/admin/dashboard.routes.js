const { Router } = require('express');
const ctrl = require('../../controllers/admin/dashboard.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/stats', adminHandler(ctrl.stats));
router.get('/recent-activity', adminHandler(ctrl.recentActivity));

module.exports = router;
