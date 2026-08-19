const { Router } = require('express');
const ctrl = require('../../controllers/admin/distribution.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

// Everything the panel needs in one call, including the current projection.
router.get('/', adminHandler(ctrl.overview));
// What the engine is actually doing right now — the reality check.
router.get('/pools', adminHandler(ctrl.pools));
// Seats held vs cap — so a plan being full is visible before a sale fails.
router.get('/seats', adminHandler(ctrl.seats));
// "If I saved this, what would happen?" Reads only; POST because the proposed
// settings are a body.
router.post('/preview', adminHandler(ctrl.preview));

router.put('/config', adminHandler(ctrl.saveConfig));
router.put('/entitlements', adminHandler(ctrl.saveEntitlements));

module.exports = router;
