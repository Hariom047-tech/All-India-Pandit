const { Router } = require('express');
const ctrl = require('../controllers/misc.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/', asyncHandler(ctrl.blogList));
router.get('/:id', asyncHandler(ctrl.blogById));

module.exports = router;
