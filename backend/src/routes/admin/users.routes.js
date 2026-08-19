const { Router } = require('express');
const ctrl = require('../../controllers/admin/users.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.get('/:id', adminHandler(ctrl.getById));
router.get('/:id/activity', adminHandler(ctrl.activity));
router.put('/:id', adminHandler(ctrl.update));
router.post('/:id/suspend', adminHandler(ctrl.suspend));
router.post('/:id/ban', adminHandler(ctrl.ban));
router.delete('/:id', adminHandler(ctrl.remove));

module.exports = router;
