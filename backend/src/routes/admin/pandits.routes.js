const { Router } = require('express');
const ctrl = require('../../controllers/admin/pandits.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');
const mediaCtrl = require('../../controllers/admin/media.controller');
const { handlePanditMediaUpload } = require('../../middleware/panditMedia');

const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.list));
router.post('/', adminHandler(ctrl.create));
router.get('/verification-queue', adminHandler(ctrl.verificationQueue));
router.get('/:id', adminHandler(ctrl.getById));
router.put('/:id', adminHandler(ctrl.update));
router.post('/:id/verify', adminHandler(ctrl.verify));
router.post('/:id/toggle-featured', adminHandler(ctrl.toggleFeatured));
router.get('/:id/analytics', adminHandler(ctrl.analytics));
router.get('/:id/analytics/detail', adminHandler(ctrl.analyticsDetail));
router.get('/:id/leads', adminHandler(ctrl.leads));
router.post('/:id/subscription', adminHandler(ctrl.setSubscription));
router.post('/:id/pause', adminHandler(ctrl.setPaused));

// Support path for a locked-out pandit. A reset, never a reveal: the stored
// value is a bcrypt hash, so the old password cannot be recovered by design.
router.post('/:id/reset-password', adminHandler(ctrl.resetPassword));
// Maintains the second factor used by the pandit's own email+DOB reset.
router.put('/:id/date-of-birth', adminHandler(ctrl.setDateOfBirth));

// Profile photos and intro videos. handlePanditMediaUpload runs BEFORE
// adminHandler so multer has parsed the multipart body (and rejected an
// oversized or wrong-typed file) before a database transaction is opened.
router.get('/:id/media', adminHandler(mediaCtrl.list));
router.post('/:id/media', handlePanditMediaUpload, adminHandler(mediaCtrl.upload));
// Direct-to-S3 flow for large intro videos — see docs/S3_CLOUDFRONT_MIGRATION.md #7.
// 501s (S3 not configured) until the deployment sets AWS_S3_MEDIA_BUCKET; the
// multipart route above keeps working in local-disk mode either way.
router.post('/:id/media/presign', adminHandler(mediaCtrl.presign));
router.post('/:id/media/confirm', adminHandler(mediaCtrl.confirmUpload));
router.delete('/:id/media/:mediaId', adminHandler(mediaCtrl.remove));
router.put('/:id/media/reorder', adminHandler(mediaCtrl.reorder));
router.post('/:id/media/:mediaId/primary', adminHandler(mediaCtrl.setPrimaryPhoto));

module.exports = router;
