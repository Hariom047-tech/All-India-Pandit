const { Router } = require('express');
const ctrl = require('../controllers/faqs.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/faqs', asyncHandler(ctrl.list));

module.exports = router;
