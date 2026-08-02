const { Router } = require('express');
const ctrl = require('../../controllers/admin/analytics.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/overview', adminHandler(ctrl.overview));
router.get('/top-pandits', adminHandler(ctrl.topPandits));
router.get('/top-temples', adminHandler(ctrl.topTemples));
router.get('/top-services', adminHandler(ctrl.topServices));
router.get('/top-cities', adminHandler(ctrl.topCities));
router.get('/funnel', adminHandler(ctrl.funnel));

module.exports = router;
