import { redirect } from "next/navigation";
import { canSample, getBankAccess, hasAnyAccess } from "@/lib/cns/qbank-access";

/**
 * Paid access (0080). University question banks are sold in the HUB Store —
 * the whole bank or any semesters. A bank that is on sale lets everyone in to
 * browse its free samples (10 per semester, 2026-10-13); one that isn't sends
 * anyone holding no part of it back to the directory, which opens the
 * paid-access popup.
 *
 * This is the outer door only. Every page that loads questions also decides
 * full vs sample itself (semesterMode / requireSemester / canOpenSemester in
 * lib/cns/qbank-access.ts) before fetching anything.
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
  if (!hasAnyAccess(access) && !canSample(access)) redirect(`/question-bank?locked=${encodeURIComponent(institution)}`);
  return <>{children}</>;
}
