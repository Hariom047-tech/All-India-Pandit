const { Router } = require('express');
const ctrl = require('../../controllers/admin/temples.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');
const mediaCtrl = require('../../controllers/admin/templeMedia.controller');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.post('/', adminHandler(ctrl.create));
router.get('/:id', adminHandler(ctrl.getById));
router.put('/:id', adminHandler(ctrl.update));
router.delete('/:id', adminHandler(ctrl.deactivate));
router.put('/:id/timings', adminHandler(ctrl.setTimings));
router.post('/:id/pandits', adminHandler(ctrl.mapPandit));
// Replace the temple's catalogue service links. Body: { serviceSlugs: [...] }.
router.put('/:id/services', adminHandler(ctrl.setServices));

// Photo / video gallery, written into the temple_media table.
router.get('/:id/media', adminHandler(mediaCtrl.list));
router.post('/:id/media', mediaCtrl.templeUploadHandler, adminHandler(mediaCtrl.upload));
router.delete('/:id/media/:mediaId', adminHandler(mediaCtrl.remove));
router.put('/:id/media/reorder', adminHandler(mediaCtrl.reorder));
// Profile picture (list cards, search, social previews) — photos only.
router.post('/:id/media/:mediaId/cover', adminHandler(mediaCtrl.setCover));
// Hero slider placement — photos and videos. Body: { show: true | false }.
router.put('/:id/media/:mediaId/hero', adminHandler(mediaCtrl.setHero));

module.exports = router;
