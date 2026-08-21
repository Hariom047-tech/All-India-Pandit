const { Router } = require('express');
const ctrl = require('../../controllers/admin/geo.controller');
const { requireAdmin } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

// No req.db needed (reads only request headers), so this uses requireAdmin
// directly rather than adminHandler — no reason to open a DB transaction
// for this one.
router.get('/viewer-location', ctrl.viewerLocation);

module.exports = router;
