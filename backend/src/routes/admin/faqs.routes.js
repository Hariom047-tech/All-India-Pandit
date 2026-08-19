const { Router } = require('express');
const ctrl = require('../../controllers/admin/faqs.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/faqs', adminHandler(ctrl.list));
router.post('/faqs', adminHandler(ctrl.create));
router.put('/faqs/reorder', adminHandler(ctrl.reorder));
router.get('/faqs/:id', adminHandler(ctrl.getById));
router.put('/faqs/:id', adminHandler(ctrl.update));
router.put('/faqs/:id/status', adminHandler(ctrl.setStatus));
router.delete('/faqs/:id', adminHandler(ctrl.remove));

module.exports = router;
