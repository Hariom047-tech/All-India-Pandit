const { Router } = require('express');
const ctrl = require('../controllers/services.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getById));

module.exports = router;
