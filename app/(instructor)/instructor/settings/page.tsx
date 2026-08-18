import { notFound } from "next/navigation";
import { getMyInstructor } from "@/lib/cns/lms";
import { getSellerReadiness } from "@/lib/cns/lms-sales";
import { InstructorSettings } from "@/components/lms/InstructorSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Central Nursing Systems" };

/**
 * Everything about the instructor's account, in the place they actually work.
 *
 * Profile, credentials and the agreement are all editable here. Payouts is the
 * one card that links out: Stripe Connect onboarding is HUB's integration —
 * it creates the account, hosts the redirect and receives the webhooks — so CNS
 * reports the status honestly rather than pretending to own it.
 */
export default async function InstructorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const instructor = await getMyInstructor();
  if (!instructor) notFound();

  const readiness = await getSellerReadiness();

  return (
    <InstructorSettings
      instructor={instructor}
      payoutsConnected={readiness.payoutsConnected}
      hubUrl={(process.env.NEXT_PUBLIC_HUB_URL ?? "https://unn.nerusalem.com").replace(/\/+$/, "")}
      initialTab={tab}
    />
  );
}
