const { Router } = require('express');
const ctrl = require('../../controllers/admin/notifications.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.post('/send', adminHandler(ctrl.send));
router.post('/broadcast', adminHandler(ctrl.broadcast));
router.get('/history', adminHandler(ctrl.history));

module.exports = router;
