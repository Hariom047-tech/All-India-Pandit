const { Router } = require('express');
const ctrl = require('../../controllers/admin/reviews.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.get('/flagged', adminHandler(ctrl.flagged));
router.post('/:id/moderate', adminHandler(ctrl.moderate));
router.post('/bulk-moderate', adminHandler(ctrl.bulkModerate));

module.exports = router;
