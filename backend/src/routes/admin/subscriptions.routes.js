const { Router } = require('express');
const ctrl = require('../../controllers/admin/subscriptions.controller');
const { requireAdmin, requireSuperAdmin, adminHandler } = require('../../middleware/admin');

const router = Router();
router.use(requireAdmin);

router.get('/subscription-plans', adminHandler(ctrl.listPlans));
router.post('/subscription-plans', adminHandler(ctrl.createPlan));
router.put('/subscription-plans/:id', adminHandler(ctrl.updatePlan));

router.get('/subscriptions', adminHandler(ctrl.listSubscriptions));
router.post('/subscriptions/grant', adminHandler(ctrl.grant));

router.get('/payments', adminHandler(ctrl.listPayments));
router.get('/payments/:id', adminHandler(ctrl.getPayment));
// Moves real money via Razorpay — a plain admin is not enough.
router.post('/payments/:id/refund', requireSuperAdmin, adminHandler(ctrl.refund));

router.get('/revenue/overview', adminHandler(ctrl.revenueOverview));
router.get('/revenue/renewals', adminHandler(ctrl.renewalReport));

router.get('/billing/reconciliation', adminHandler(ctrl.reconciliation));

module.exports = router;
