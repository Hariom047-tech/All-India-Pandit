const { Router } = require('express');
const ctrl = require('../../controllers/admin/security.controller');
const { requireAdmin, requireSuperAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/audit-log', adminHandler(ctrl.auditLog));
router.get('/admin-activity-log', adminHandler(ctrl.adminActivityLog));
router.get('/honeypot-logs', adminHandler(ctrl.honeypotLogs));

router.get('/banned-ips', adminHandler(ctrl.bannedIps));
router.post('/ban-ip', adminHandler(ctrl.banIp));
router.delete('/ban-ip/:ip', adminHandler(ctrl.unbanIp));

router.get('/active-sessions', adminHandler(ctrl.activeSessions));
router.get('/overview', adminHandler(ctrl.overview));

// super_admin only — these affect every admin account, not just the caller's own.
router.post('/force-logout-all', requireSuperAdmin, adminHandler(ctrl.forceLogoutAll));
router.get('/admin-users', requireSuperAdmin, adminHandler(ctrl.listAdminUsers));
router.post('/admin-users', requireSuperAdmin, adminHandler(ctrl.createAdminUser));

module.exports = router;
