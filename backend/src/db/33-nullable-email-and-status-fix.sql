-- Two related fixes surfaced by the phone-OTP passwordless login flow
-- (controllers/auth.controller.js's phoneLogin, added in 23-otp-phone-login.sql):
--
-- 1. `users.email` was NOT NULL, so a phone-only signup had no real email to
--    store and had to invent one (`phone-<digits>@otp.panditsuggest.local`)
--    just to satisfy the column — which then showed up as a fake-looking
--    address everywhere the admin panel or the user's own profile displays
--    it. Email is nullable from here on; UNIQUE still holds (Postgres allows
--    any number of NULLs under a UNIQUE constraint, so this doesn't reopen
--    the "same email twice" problem it existed to prevent).
--
-- 2. `phoneLogin`/`verifyOtp` were flipping `phone_verified`/`email_verified`
--    to TRUE without ever moving the account out of `status =
--    'pending_verification'` — so a devotee who had genuinely verified their
--    phone over WhatsApp OTP still showed as unverified everywhere `status`
--    is read (the admin Users list, `pandits`/`temples` visibility, review
--    posting). repositories/auth.repository.js's markTargetVerified() now
--    promotes pending_verification -> active the moment either target is
--    verified, going forward. This backfills every row that already earned
--    that promotion under the old code.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Existing accounts that verified a phone or email but were never promoted.
UPDATE users
SET status = 'active'
WHERE status = 'pending_verification'
  AND (phone_verified = TRUE OR email_verified = TRUE);

-- Existing phone-only signups stuck with the synthetic placeholder address —
-- clear it back to NULL now that the column allows it.
UPDATE users
SET email = NULL
WHERE email LIKE '%@otp.panditsuggest.local';
