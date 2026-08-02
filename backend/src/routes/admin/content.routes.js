const { Router } = require('express');
const ctrl = require('../../controllers/admin/content.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/blog/posts', adminHandler(ctrl.listPosts));
router.post('/blog/posts', adminHandler(ctrl.create));
router.put('/blog/posts/:id', adminHandler(ctrl.update));
router.delete('/blog/posts/:id', adminHandler(ctrl.remove));
router.post('/blog/posts/:id/publish', adminHandler(ctrl.publish));
router.post('/blog/posts/:id/unpublish', adminHandler(ctrl.unpublish));

module.exports = router;
