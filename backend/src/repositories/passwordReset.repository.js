const { query } = require('../config/db');

/**
 * All three helpers run pre-authentication (there is no session yet), so
 * they go through the SECURITY DEFINER functions in 03-qualified-leads.sql
 * rather than touching the tables directly — the same pattern
 * auth_find_user_by_email() already established for login.
 */

/**
 * Resolves email + DOB to a user id, and ONLY for pandit accounts.
 *
 * Returning null covers every failure mode identically — unknown email,
 * wrong DOB, devotee account, admin account, deleted account. The caller
 * cannot tell them apart, which is the point: a distinguishable response
 * turns this into an account-enumeration oracle and a DOB oracle.
 */
async function findPanditForReset(email, dateOfBirth) {
  const { rows } = await query('SELECT user_id FROM auth_find_pandit_for_reset($1, $2::date)', [email, dateOfBirth]);
  return rows[0]?.user_id || null;
}

/** Issues a challenge, voiding any previous live one for the same account. */
async function createChallenge({ userId, tokenHash, ttlMinutes, ip }) {
  const { rows } = await query(
    'SELECT auth_create_reset_challenge($1, $2, $3, $4) AS id',
    [userId, tokenHash, ttlMinutes, ip || ''],
  );
  return rows[0].id;
}

/**
 * Redeems the challenge and rotates the password atomically, revoking every
 * session on that account. Single-use is enforced inside the UPDATE's
 * predicate, so two parallel redemptions cannot both win.
 */
async function consumeChallenge(tokenHash, newPasswordHash) {
  const { rows } = await query(
    'SELECT * FROM auth_consume_reset_challenge($1, $2)',
    [tokenHash, newPasswordHash],
  );
  return rows[0];
}

module.exports = { findPanditForReset, createChallenge, consumeChallenge };
