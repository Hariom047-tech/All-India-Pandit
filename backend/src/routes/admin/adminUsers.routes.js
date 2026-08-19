const { Router } = require('express');
const ctrl = require('../../controllers/admin/users.controller');
const { requireAdmin, adminHandler } = require('../../middleware/admin');

/**
 * Separate route/screen for admin & super_admin accounts (Section 1: "Admins
 * must not appear in either list unless there is a separate Admin Users
 * screen"). Deliberately read-only here — creating/suspending/deleting an
 * admin account is a super-admin-only, higher-stakes action than anything
 * else in this file and is intentionally left out of this pass's scope
 * rather than bolted on without real review of that workflow.
 */
const router = Router();
router.use(requireAdmin);

router.get('/', adminHandler(ctrl.listAdmins));

module.exports = router;
