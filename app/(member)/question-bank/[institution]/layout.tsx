import { redirect } from "next/navigation";
import { getBankAccess, hasAnyAccess } from "@/lib/cns/qbank-access";

/**
 * Paid access (0080). University question banks are sold in the HUB Store —
 * the whole bank or one semester. Anyone holding no part of this university's
 * bank is sent back to the directory, which opens the paid-access popup with a
 * link to buy it.
 *
 * This is the outer door only. A buyer of Semester 3 gets past it, so every
 * page that loads questions also checks the semester itself (requireSemester /
 * canOpenSemester in lib/cns/qbank-access.ts) before fetching anything.
 */
export default async function QuestionBankInstitutionGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}) {
  const { institution } = await params;
  const access = await getBankAccess(institution);
  if (!hasAnyAccess(access)) redirect(`/question-bank?locked=${encodeURIComponent(institution)}`);
  return <>{children}</>;
}
