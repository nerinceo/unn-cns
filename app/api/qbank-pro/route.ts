import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/supabase/server";
import { getBankAccess } from "@/lib/cns/qbank-access";
import { checkLimit } from "@/lib/ratelimit";
import {
  PRO,
  getAttempt,
  getExamInfo,
  getSampleExams,
  itemSemester,
  proRead,
  saveAttemptScore,
  setMark,
  submitAttempt,
} from "@/lib/cns/qbank-pro";
import { decide, generalModeOf, semesterModeOf } from "@/lib/cns/qbank-pro-gate";
import { formatAnswer } from "@/lib/cns/qbank-pro-format";

/**
 * Question Bank Pro — what the mock and viva exam runners call from the
 * browser: the paper, the answer key, submitting, and the self score.
 *
 *   POST /api/qbank-pro   { fn, args }
 *
 * Also Save (fn "qb2_mark") on any question or hacks card.
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
  "qb2_attempt",
  "qb2_submit",
  "qb2_save_score",
  "qb2_mark",
]);

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(req: NextRequest) {
  // JSON only, and from this site: a cross-site form can neither set this
  // content type without a preflight nor forge the Origin.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(415, "Expected JSON");
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return fail(403, "Cross-site request refused");

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

  // Save on a question or a hacks card (p_done is still accepted, no longer sent). Allowed on what
  // the member can open — its semester bought, or offered as a sample.
  if (fn === "qb2_mark") {
    const kind = args.p_kind;
    const item = Number(args.p_item);
    const flag = (v: unknown) => (v === true ? true : v === false ? false : null);
    if ((kind !== "q" && kind !== "mnemonic" && kind !== "note" && kind !== "sos") || !Number.isSafeInteger(item) || item <= 0) {
      return fail(400, "Unknown item.");
    }
    const saved = flag(args.p_saved);
    const done = flag(args.p_done);
    if (saved === null && done === null) return fail(400, "Nothing to change.");
    try {
      const semester = await itemSemester(kind, item);
      if (semester === undefined) return fail(404, "Item not found.");
      const access = await getBankAccess(PRO.institution, PRO.course);
      const mode = semester == null ? generalModeOf(access) : semesterModeOf(access, semester);
      if (mode === "closed") return fail(403, "This item is not open to your account.");
      return NextResponse.json(await setMark(user.id, kind, item, saved, done));
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
    // The member's own attempt: gated like submitting (same exam rules), read-only.
    const decision = await decide(fn === "qb2_attempt" ? "qb2_submit" : fn, args, deps);
    if ("deny" in decision) return fail(decision.deny, decision.message);
    if ("empty" in decision) return NextResponse.json([]);
    if ("submit" in decision) {
      const { kind, id } = decision.submit;
      return NextResponse.json(fn === "qb2_attempt" ? await getAttempt(user.id, kind, id) : await submitAttempt(user.id, kind, id));
    }
    if ("score" in decision) {
      const s = decision.score;
      return NextResponse.json(await saveAttemptScore(user.id, s.kind, s.id, s.score));
    }
    const data = await proRead(decision.read, decision.args);
    // Answer keys leave as sanitised HTML, formatted exactly as the question
    // pages format answers — the runner never builds markup from content.
    if ((fn === "get_mock_exam_answer_key" || fn === "get_viva_exam_answer_key") && Array.isArray(data)) {
      return NextResponse.json(
        data.map((r: Record<string, unknown>) => ({
          ...r,
          answer_html: formatAnswer(r.answer),
          rationale_html: formatAnswer(r.rationale),
        })),
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("[qbank-pro]", fn, e instanceof Error ? e.message : e);
    return fail(500, "The question bank could not be reached. Please try again.");
  }
}
