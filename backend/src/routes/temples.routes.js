const { Router } = require('express');
const ctrl = require('../controllers/temples.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getById));
router.post('/:id/inquiry', asyncHandler(ctrl.inquire));

module.exports = router;
