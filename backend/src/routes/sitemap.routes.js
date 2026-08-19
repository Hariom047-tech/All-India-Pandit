const { Router } = require('express');
const ctrl = require('../controllers/sitemap.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.get('/sitemap.xml', asyncHandler(ctrl.sitemap));

module.exports = router;
