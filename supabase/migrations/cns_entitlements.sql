-- ===========================================================================
-- CNS — digital entitlements (READ-ONLY view over HUB's marketplace).
--
-- Runs against the SAME Supabase project as HUB. Purely additive: creates one
-- view and grants select on it. It does not alter, drop or re-policy any
-- marketplace table, and it never writes.
--
-- WHY A VIEW AND NOT DIRECT TABLE ACCESS
-- CNS must not learn HUB's marketplace schema. That schema is actively
-- churning (variants, coupons, chargebacks), so coupling to it would both
-- break CNS on a HUB refactor and discourage HUB from refactoring. This view
-- is the entire contract between the two.
--
-- WHAT IT DELIBERATELY OMITS
-- digital_file_key and digital_access_link. CNS never sees an R2 object key —
-- that omission is the security boundary. Reading a purchased file happens by
-- deep-linking to HUB's watermarked reader, which re-checks entitlement and
-- mints its own short-lived presigned URL.
--
-- THE TRAP THIS VIEW EXISTS TO HANDLE
-- A marketplace order is EITHER single-item OR cart:
--   "Buy now"      -> orders.listing_id is SET, and there are NO order_items
--   cart checkout  -> orders.listing_id is NULL, lines live in order_items
-- A query that reads only orders.listing_id therefore silently misses every
-- cart purchase. Hence the union all over both shapes.
--
-- SELF-FILTERING BY DESIGN
-- The view is SECURITY DEFINER (the PostgreSQL default), so it bypasses RLS on
-- marketplace_listings — necessary, because that table's policy is "active or
-- owner" and a listing flipped to 'sold' would otherwise become invisible to
-- the person who bought it. That makes an unfiltered view a data leak: any
-- member could read everyone's purchase history. So the WHERE clause pins it
-- to auth.uid(). Query it with the member's OWN session (anon key + their
-- JWT), never the service role — under service role auth.uid() is NULL and it
-- correctly returns nothing.
--
-- Run manually in Supabase Dashboard > SQL Editor. Safe to re-run.
-- ===========================================================================

create or replace view public.user_digital_entitlements as
-- Single-item ("Buy now") orders: the listing hangs off the order itself.
select
  o.buyer_id                          as user_id,
  l.id                                as listing_id,
  l.title,
  l.category,
  l.seller_id,
  l.digital_file_name,
  l.digital_updated_at,
  (l.digital_access_link is not null) as has_access_link,
  o.id                                as order_id,
  o.status                            as order_status,
  o.paid_at,
  false                               as via_seller
from public.orders o
join public.marketplace_listings l on l.id = o.listing_id
where o.item_type = 'marketplace'
  -- Mirrors isEntitled() in lib/actions/marketplace-digital.ts EXACTLY.
  -- See the partial-refund note at the bottom of this file before widening.
  and o.status = 'paid'
  and l.delivery_method = 'digital'
  -- deliveryKind() precedence: a service listing is a service even if the
  -- delivery_method says digital.
  and coalesce(l.listing_type, 'product') <> 'service'
  and o.buyer_id = auth.uid()

union all

-- Cart orders: orders.listing_id IS NULL, lines live in order_items.
select
  o.buyer_id,
  l.id,
  l.title,
  l.category,
  l.seller_id,
  l.digital_file_name,
  l.digital_updated_at,
  (l.digital_access_link is not null),
  o.id,
  o.status,
  o.paid_at,
  false
from public.order_items oi
join public.orders o                on o.id = oi.order_id
join public.marketplace_listings l  on l.id = oi.listing_id
where o.item_type = 'marketplace'
  and o.status = 'paid'
  and l.delivery_method = 'digital'
  and coalesce(l.listing_type, 'product') <> 'service'
  and o.buyer_id = auth.uid()

union all

-- Sellers always reach their own digital products. isEntitled() short-circuits
-- on sellerId === userId before it ever looks at orders, so an author browsing
-- their own question bank is not locked out.
select
  l.seller_id,
  l.id,
  l.title,
  l.category,
  l.seller_id,
  l.digital_file_name,
  l.digital_updated_at,
  (l.digital_access_link is not null),
  null::uuid,
  'seller'::text,
  null::timestamptz,
  true
from public.marketplace_listings l
where l.delivery_method = 'digital'
  and coalesce(l.listing_type, 'product') <> 'service'
  and l.seller_id = auth.uid();

comment on view public.user_digital_entitlements is
  'Read-only contract between HUB marketplace and CNS. Self-filters to auth.uid(); query with the member''s own session, never service role. Deliberately excludes digital_file_key / digital_access_link.';

grant select on public.user_digital_entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- Known divergence to decide on (deliberately NOT fixed here)
--
-- isEntitled() tests `status = 'paid'` strictly, so an order moved to
-- 'partially_refunded' -- e.g. a small goodwill refund on a bundle -- silently
-- revokes the buyer's access to a file they still paid for. This view
-- reproduces that behaviour on purpose: CNS being quietly MORE permissive than
-- HUB would be worse than either behaviour alone, because the same purchase
-- would unlock in one app and not the other.
--
-- The fix belongs in HUB (widen isEntitled to
-- `status in ('paid','partially_refunded')`), and this view should be widened
-- in the SAME change, never before it.
--
-- Chargebacks are NOT surfaced at all. orders.chargeback_status is added by
-- supabase/migrations/marketplace_chargebacks.sql in the HUB repo, which is
-- still uncommitted WIP and has never been applied to this database — adding
-- the column here first would make the view fail to create.
--
-- Once that migration lands, add `o.chargeback_status` back to the first two
-- branches (and `null::text` to the seller branch) if CNS should be able to
-- suspend library access on an open dispute. Today chargeback_status only
-- freezes seller payout; it does not revoke buyer access.
-- ---------------------------------------------------------------------------
