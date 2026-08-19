const { Router } = require('express');
const ctrl = require('../controllers/services.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
// Before '/:id' — otherwise Express matches "categories" as a service slug.
router.get('/categories', asyncHandler(ctrl.homeCategories));
router.get('/:id', asyncHandler(ctrl.getById));

module.exports = router;
