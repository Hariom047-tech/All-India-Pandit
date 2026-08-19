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

// Qualified leads for the authenticated pandit. No :panditId anywhere in
// this surface — ownership comes from the session, never from the URL.
router.get('/leads', asyncHandler(ctrl.listLeads));
router.patch('/leads/:id', asyncHandler(ctrl.updateLeadStatus));

// Self-service profile edit. Allow-listed server-side — a pandit can never
// write their own verification status, tier, featured flag or rank.
router.get('/pandit-profile', asyncHandler(ctrl.getOwnPanditProfile));
router.put('/pandit-profile', asyncHandler(ctrl.updateOwnPanditProfile));

router.get('/export', asyncHandler(ctrl.exportData));
router.delete('/', asyncHandler(ctrl.deleteAccount));

module.exports = router;
