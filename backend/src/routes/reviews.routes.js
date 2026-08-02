const { Router } = require('express');
const ctrl = require('../controllers/reviews.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', requireAuth, asyncHandler(ctrl.create));

module.exports = router;
