const { Router } = require('express');
const ctrl = require('../../controllers/admin/settings.controller');
const { requireAdmin, requireSuperAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.getAll));
router.put('/:key', requireSuperAdmin, adminHandler(ctrl.upsert));

module.exports = router;
