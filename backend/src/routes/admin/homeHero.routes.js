const { Router } = require('express');
const ctrl = require('../../controllers/admin/homeHero.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
// Multer runs before adminHandler so the multipart body is parsed (and an
// oversized file rejected) before a database transaction is opened.
router.post('/', ctrl.heroUpload, adminHandler(ctrl.upload));
router.put('/reorder', adminHandler(ctrl.reorder));
router.delete('/:id', adminHandler(ctrl.remove));

module.exports = router;
