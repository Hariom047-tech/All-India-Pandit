const { Router } = require('express');
const ctrl = require('../controllers/community.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', requireAuth, asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getById));
router.post('/:id/comments', requireAuth, asyncHandler(ctrl.addComment));

module.exports = router;
