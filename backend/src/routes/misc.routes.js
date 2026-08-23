const { Router } = require('express');
const ctrl = require('../controllers/misc.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { optionalAuth } = require('../middleware/auth');

const router = Router();

router.get('/plans', asyncHandler(ctrl.plans));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/taxonomy', asyncHandler(ctrl.taxonomy));
router.get('/home-hero', asyncHandler(ctrl.homeHero));
router.get('/settings', asyncHandler(ctrl.publicSettings));
router.get('/reviews', asyncHandler(ctrl.reviews));
router.post('/recommend', optionalAuth, asyncHandler(ctrl.recommend));

module.exports = router;
