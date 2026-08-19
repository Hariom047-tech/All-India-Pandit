const { Router } = require('express');
const ctrl = require('../../controllers/admin/aiKnowledge.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

/* ── Knowledge base ─────────────────────────────────────────────────── */
router.get('/knowledge', adminHandler(ctrl.list));
router.get('/knowledge/stats', adminHandler(ctrl.stats));
router.get('/knowledge/categories', adminHandler(ctrl.categories));
router.get('/knowledge/:id', adminHandler(ctrl.getById));
router.post('/knowledge', adminHandler(ctrl.create));
router.put('/knowledge/:id', adminHandler(ctrl.update));
// Publish / unpublish. Takes effect on live answers in the same transaction.
router.put('/knowledge/:id/status', adminHandler(ctrl.setStatus));
router.delete('/knowledge/:id', adminHandler(ctrl.remove));
// Re-index runs outside req.db — it makes a network call to the embedding API.
router.post('/knowledge/:id/reindex', adminHandler(ctrl.reindex));

/* ── Analytics ──────────────────────────────────────────────────────── */
router.get('/analytics/overview', adminHandler(ctrl.overview));
router.get('/analytics/demand-gaps', adminHandler(ctrl.demandGaps));
router.get('/analytics/low-confidence', adminHandler(ctrl.lowConfidence));

module.exports = router;
