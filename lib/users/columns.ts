/**
 * Every `public.users` column that a non-service client may read.
 *
 * MIRRORED FILE — this module exists in unn-platform, unn-cns and unn-uhn and
 * must stay identical. It is registered in unn-cns/scripts/check-hub-drift.mjs;
 * run `npm run check:drift` there after editing this file.
 *
 * Client-safe on purpose (no server-only imports), so browser components and
 * server code share one source of truth.
 *
 * Migration 0020 revoked the blanket SELECT on public.users and re-granted an
 * allowlist that omits `email`. Migration 0024 removed `phone`, `address` and
 * `date_of_birth` from that allowlist too — any signed-in account could
 * otherwise harvest every member's contact details in one REST request, and
 * the contact editor already promised date of birth was "only visible to you".
 *
 * With column-level grants a bare `.select("*")` errors ("permission denied for
 * table"), so every non-service read of `users` must name its columns here and
 * must NOT ask for email/phone/address/date_of_birth. Own email comes from the
 * auth session; own phone/address/date of birth come from `getOwnContactInfo()`
 * (each repo keeps its own copy of that helper), which reads them with the
 * service-role client after checking the row belongs to the caller.
 *
 * Keep this in lockstep with the grant in 0024 — a column added there but not
 * here, or vice-versa, reads back as absent.
 */
export const USER_COLUMNS_PUBLIC =
  "id, full_name, profile_photo, country, role, professional_title, bio, created_at, account_status, verification_status, two_factor_enabled, cover_photo, last_login_date, login_streak, referral_code, referred_by, referral_verified_awarded, profile_url, waitlist_status, nubo_milestones_enabled, account_kind, marketplace_seller_agreed_at, marketplace_buyer_agreed_at, home_page_mode, home_unit_id, account_scope, job_title, profession_id, profession_other";

/**
 * @deprecated Use `USER_COLUMNS_PUBLIC`. The old name claimed only `email` was
 * withheld, which stopped being true in 0024. Kept as an alias so anything
 * still importing it keeps compiling.
 */
export const USER_COLUMNS_NO_EMAIL = USER_COLUMNS_PUBLIC;
