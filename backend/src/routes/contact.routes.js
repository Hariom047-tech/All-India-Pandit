const { Router } = require('express');
const ctrl = require('../controllers/contact.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

router.post('/', asyncHandler(ctrl.send));

module.exports = router;
