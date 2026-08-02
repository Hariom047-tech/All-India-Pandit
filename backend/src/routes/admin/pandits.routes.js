const { Router } = require('express');
const ctrl = require('../../controllers/admin/pandits.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.get('/verification-queue', adminHandler(ctrl.verificationQueue));
router.post('/:id/verify', adminHandler(ctrl.verify));
router.post('/:id/toggle-featured', adminHandler(ctrl.toggleFeatured));
router.get('/:id/analytics', adminHandler(ctrl.analytics));
router.post('/:id/subscription', adminHandler(ctrl.setSubscription));

module.exports = router;
