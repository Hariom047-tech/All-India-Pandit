const { Router } = require('express');
const ctrl = require('../../controllers/admin/inquiries.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.get('/:id', adminHandler(ctrl.getById));
router.put('/:id/status', adminHandler(ctrl.setStatus));

module.exports = router;
