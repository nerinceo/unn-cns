/**
 * Every `public.users` column that a non-service client may read.
 *
 * Client-safe (no server-only imports). Migrations 0020 and 0024 (in the HUB
 * repo, which owns the shared migrations) revoke the blanket SELECT on
 * public.users and re-grant an allowlist that omits `email` (0020) plus
 * `phone`, `address` and `date_of_birth` (0024) — any signed-in account could
 * otherwise harvest every member's contact details in one REST request.
 *
 * With column-level grants a bare `.select("*")` errors ("permission denied for
 * table"), so every non-service read of `users` must name its columns here and
 * must NOT ask for email/phone/address/date_of_birth. Own email comes from the
 * auth session; own phone/address/date of birth come from `getOwnContactInfo()`
 * in lib/users/own-contact.ts, which reads them with the service-role client
 * after checking the row belongs to the caller.
 *
 * Keep this identical to the HUB copy and to the grant in 0024 — a column added
 * there but not here reads back as absent.
 */
export const USER_COLUMNS_PUBLIC =
  "id, full_name, profile_photo, country, role, professional_title, bio, created_at, account_status, verification_status, two_factor_enabled, cover_photo, last_login_date, login_streak, referral_code, referred_by, referral_verified_awarded, profile_url, waitlist_status, nubo_milestones_enabled, account_kind, marketplace_seller_agreed_at, marketplace_buyer_agreed_at, home_page_mode, home_unit_id, account_scope, job_title, profession_id, profession_other";

/**
 * @deprecated Use `USER_COLUMNS_PUBLIC`. The old name claimed only `email` was
 * withheld, which stopped being true in 0024. Kept as an alias so anything
 * still importing it keeps compiling.
 */
export const USER_COLUMNS_NO_EMAIL = USER_COLUMNS_PUBLIC;
