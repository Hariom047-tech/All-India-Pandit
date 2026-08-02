const { Router } = require('express');
const ctrl = require('../controllers/me.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth); // everything under /api/me is about the logged-in user

router.get('/saved-pandits', asyncHandler(ctrl.listSavedPandits));
router.post('/saved-pandits', asyncHandler(ctrl.addSavedPandit));
router.delete('/saved-pandits/:slug', asyncHandler(ctrl.removeSavedPandit));

router.get('/saved-temples', asyncHandler(ctrl.listSavedTemples));
router.post('/saved-temples', asyncHandler(ctrl.addSavedTemple));
router.delete('/saved-temples/:slug', asyncHandler(ctrl.removeSavedTemple));

router.get('/notifications', asyncHandler(ctrl.listNotifications));
router.post('/notifications/:id/read', asyncHandler(ctrl.readNotification));

router.get('/inquiries', asyncHandler(ctrl.inbox));
router.patch('/inquiries/:id', asyncHandler(ctrl.updateInquiry));

router.get('/dashboard', asyncHandler(ctrl.panditDashboard));

router.get('/export', asyncHandler(ctrl.exportData));
router.delete('/', asyncHandler(ctrl.deleteAccount));

module.exports = router;
