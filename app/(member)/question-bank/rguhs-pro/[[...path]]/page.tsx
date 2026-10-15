import { redirect } from "next/navigation";
import { getBankAccess } from "@/lib/cns/qbank-access";
import { PRO } from "@/lib/cns/qbank-pro";
import { bankIsReachable } from "@/lib/cns/qbank-pro-gate";
import { PRO_BASE, PRO_HOME, isPagePath } from "@/lib/cns/qbank-pro-pages";
import { ProBankFrame } from "@/components/question-bank/ProBankFrame";

export const dynamic = "force-dynamic";
export const metadata = { title: "RGUHS B.Sc Nursing Question Bank Pro — Central Nerusalem Space" };

/**
 * Question Bank Pro, in the CNS shell.
 *
 * /question-bank/rguhs-pro/<page>.html shows the bank page <page>.html (served
 * from PRO_BASE) under the CNS header, so the address bar always names the
 * page the member is on. Every page and every data call is gated again where
 * it is served (app/question-bank/rguhs-pro/view); this check only decides
 * whether to show the bank at all.
 */
export default async function QuestionBankProPage({
  params,
  searchParams,
}: {
  params: { path?: string[] };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const access = await getBankAccess(PRO.institution, PRO.course);
  if (!bankIsReachable(access)) redirect(`/question-bank?locked=${PRO.institution}`);

  const requested = (params.path ?? []).join("/");
  const page = requested && isPagePath(requested) ? requested : "index.html";
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    for (const value of Array.isArray(v) ? v : v != null ? [v] : []) query.append(k, value);
  }
  const qs = query.toString();

  return <ProBankFrame src={`${PRO_BASE}/${page}${qs ? `?${qs}` : ""}`} frameBase={PRO_BASE} homeBase={PRO_HOME} />;
}
