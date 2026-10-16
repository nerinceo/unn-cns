import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/supabase/server";
import { getBankAccess } from "@/lib/cns/qbank-access";
import { checkLimit } from "@/lib/ratelimit";
import {
  PRO,
  getAttempt,
  getExamInfo,
  getSampleExams,
  itemSemesters,
  proRead,
  setRead,
  setSaved,
  submitAttempt,
} from "@/lib/cns/qbank-pro";
import { decide, maySave } from "@/lib/cns/qbank-pro-gate";
import { toPaperQuestion, toVivaQuestion } from "@/lib/cns/qbank-pro-exams";
import { proHtml } from "@/lib/cns/qbank-pro-format";

/**
 * Question Bank Pro — what the mock and viva exam runners call from the
 * browser: the paper, the answer key, and submitting. There is no score —
 * students evaluate themselves against the revealed key.
 *
 *   POST /api/qbank-pro   { fn, args }
 *
 * Also Save (fn "qb2_mark") on a question or hacks card of a bought semester.
 *
 * Same gate as the server-rendered pages (lib/cns/qbank-pro-gate): the exam's
 * semester must be bought, or the exam must be that semester's free sample;
 * the answer key opens only once the submission is recorded.
 */
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "get_written_exam_paper",
  "get_mock_exam_answer_key",
  "get_viva_exam_questions",
  "get_viva_exam_answer_key",
  "qb2_submit",
  "qb2_mark",
]);

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(req: NextRequest) {
  // JSON only, and from this site: a cross-site form can neither set this
  // content type without a preflight nor forge the Origin.
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return fail(415, "Expected JSON");
  // Browsers send Origin on every POST, same-site included; a request without it is not one of our pages.
  if (req.headers.get("origin") !== req.nextUrl.origin) return fail(403, "Cross-site request refused");

  const profile = await getCurrentUserProfile();
  if ((profile as { account_status?: string | null } | null)?.account_status === "suspended") {
    return fail(403, "This account cannot open the question bank.");
  }
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");

  const limited = await checkLimit("qbank", user.id);
  if (limited) return fail(429, limited.error);

  const raw = await req.text();
  if (raw.length > 4_000) return fail(413, "Request too large");
  let fn: string;
  let args: Record<string, unknown>;
  try {
    const body = JSON.parse(raw) as { fn?: unknown; args?: unknown };
    if (typeof body.fn !== "string" || !ALLOWED.has(body.fn)) throw new Error();
    if (body.args != null && (typeof body.args !== "object" || Array.isArray(body.args))) throw new Error();
    fn = body.fn;
    args = (body.args ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid request");
  }

  // Save / unsave a question or a hacks card. Only in a semester the member
  // has BOUGHT, never on a free sample: /saved shows full answers, so a
  // sample-mode save would open the whole bank (pre-launch audit 2026-10-15).
  if (fn === "qb2_mark") {
    const kind = args.p_kind;
    const item = Number(args.p_item);
    if ((kind !== "q" && kind !== "mnemonic" && kind !== "note" && kind !== "sos") || !Number.isSafeInteger(item) || item <= 0) {
      return fail(400, "Unknown item.");
    }
    // Save (any kind), or Read (Previous Years questions only).
    const save = typeof args.p_saved === "boolean" ? args.p_saved : null;
    const read = kind === "q" && typeof args.p_read === "boolean" ? args.p_read : null;
    if (save === null && read === null) return fail(400, "Nothing to change.");
    try {
      const [semesters, access] = await Promise.all([itemSemesters(kind, item), getBankAccess(PRO.institution, PRO.course)]);
      if (!semesters) return fail(404, "Item not found.");
      if (!maySave(access, semesters)) return fail(403, "Buy this semester to save items.");
      return NextResponse.json(save !== null ? await setSaved(user.id, kind, item, save) : await setRead(user.id, item, read as boolean));
    } catch (e) {
      console.error("[qbank-pro] mark", e instanceof Error ? e.message : e);
      return fail(500, "Could not save. Please try again.");
    }
  }

  try {
    const deps = {
      access: await getBankAccess(PRO.institution, PRO.course),
      examInfo: getExamInfo,
      sampleExams: getSampleExams,
      hasSubmitted: async (kind: "written" | "viva", id: number) => (await getAttempt(user.id, kind, id)) != null,
    };
    const decision = await decide(fn, args, deps);
    if ("deny" in decision) return fail(decision.deny, decision.message);
    if ("empty" in decision) return NextResponse.json([]);
    if ("submit" in decision) {
      const { kind, id } = decision.submit;
      return NextResponse.json(await submitAttempt(user.id, kind, id));
    }
    const data = await proRead(decision.read, decision.args);
    // Answer keys leave as sanitised HTML, formatted exactly as the question
    // pages format answers — the runner never builds markup from content.
    if ((fn === "get_mock_exam_answer_key" || fn === "get_viva_exam_answer_key") && Array.isArray(data)) {
      return NextResponse.json(
        data.map((r: Record<string, unknown>) => ({
          question_order: r.question_order,
          question: r.question,
          marks: r.marks,
          correct_option: r.correct_option,
          option_a: r.option_a,
          option_b: r.option_b,
          option_c: r.option_c,
          option_d: r.option_d,
          key_points: r.key_points,
          answer_html: proHtml(r.answer_html, r.answer),
          rationale_html: proHtml(r.rationale_html, r.rationale),
          tip_html: proHtml(r.tip_html, null),
        })),
      );
    }
    // Papers leave without question ids: an id is what Save takes, and a saved
    // question shows its answer on /saved, so the key must wait for Submit.
    if (fn === "get_written_exam_paper" && Array.isArray(data)) return NextResponse.json(data.map(toPaperQuestion));
    if (fn === "get_viva_exam_questions" && Array.isArray(data)) return NextResponse.json(data.map(toVivaQuestion));
    return NextResponse.json(data);
  } catch (e) {
    console.error("[qbank-pro]", fn, e instanceof Error ? e.message : e);
    return fail(500, "The question bank could not be reached. Please try again.");
  }
}
