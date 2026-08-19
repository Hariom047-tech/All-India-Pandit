const { Router } = require('express');
const ctrl = require('../controllers/render.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

// Mounted at '/' in routes/index.js — see docker/nginx/*.conf for the
// root-path proxy that routes real browser/crawler traffic here for these
// 4 shapes only. Everything else stays on nginx's normal SPA catch-all.
router.get('/_render/', asyncHandler(ctrl.home));
router.get('/_render/temples/:slug', asyncHandler(ctrl.temple));
router.get('/_render/services/:slug', asyncHandler(ctrl.service));
router.get('/_render/pandits/:slug', asyncHandler(ctrl.pandit));

module.exports = router;
