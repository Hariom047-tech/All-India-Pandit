const { Router } = require('express');
const ctrl = require('../../controllers/admin/community.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/posts', adminHandler(ctrl.listPosts));
router.post('/posts/:id/moderate', adminHandler(ctrl.moderatePost));
router.post('/comments/:id/moderate', adminHandler(ctrl.moderateComment));

module.exports = router;
