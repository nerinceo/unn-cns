import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/supabase/server";
import { END_SESSION_URL, authUserIsGone } from "@/lib/auth/session-guard";
import { getBankAccess } from "@/lib/cns/qbank-access";
import { checkLimit } from "@/lib/ratelimit";
import {
  PRO,
  getAttempt,
  getExamInfo,
  getProPage,
  getSampleExams,
  proRead,
  saveAttemptScore,
  submitAttempt,
} from "@/lib/cns/qbank-pro";
import {
  bankIsReachable,
  decide,
  generalModeOf,
  semesterModeOf,
  semesterParam,
  type ProMode,
} from "@/lib/cns/qbank-pro-gate";
import { PRO_BASE, classifyPage, isPagePath, renderProPage } from "@/lib/cns/qbank-pro-pages";

/**
 * Question Bank Pro — every page and every data call, behind one gate.
 *
 *   GET  /question-bank/rguhs-pro/<page>.html           a copied nerusalem.in page
 *   POST /question-bank/rguhs-pro/_data/rest/v1/rpc/<fn> what the page's Supabase
 *        client calls (the path PostgREST would have), answered from qbank2
 *
 * Paid content leaves this handler only after the member's qbank_access rows
 * (main project, RLS) open that semester — or as the fixed free sample when
 * the bank is on sale (lib/cns/qbank-pro-gate). The copied pages carry no
 * secrets of their own: the source project's URL and key are rewritten away
 * (lib/cns/qbank-pro-pages).
 *
 * Lives outside the (member) group because it answers raw HTML and JSON, not a
 * React page; the account checks that layout makes are repeated here.
 */
export const dynamic = "force-dynamic";

type Params = { params: { path?: string[] } };

const PRIVATE_HTML = {
  "content-type": "text/html; charset=utf-8",
  // Paid content: never stored by a shared cache, never indexed.
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

/** Same account gate as app/(member)/layout.tsx. */
async function accountGate(): Promise<{ userId: string } | { redirect: string } | null> {
  const profile = await getCurrentUserProfile();
  if ((profile as { account_status?: string | null } | null)?.account_status === "suspended") {
    return { redirect: END_SESSION_URL };
  }
  if (profile) return { userId: (profile as { id: string }).id };
  const user = await getCurrentUser();
  if (user && (await authUserIsGone(user.id))) return { redirect: END_SESSION_URL };
  return user ? { userId: user.id } : null;
}

const lockedUrl = (req: NextRequest) => new URL(`/question-bank?locked=${PRO.institution}`, req.url);

// ---------------------------------------------------------------------------
// Pages

export async function GET(req: NextRequest, { params }: Params) {
  const parts = params.path ?? [];
  if (parts.length === 0) {
    // Relative links in the copied pages resolve against the page's own URL,
    // so the bank always opens at a real file path.
    return NextResponse.redirect(new URL(`${PRO_BASE}/index.html`, req.url));
  }
  const path = parts.join("/");
  if (!isPagePath(path)) return new NextResponse("Not found", { status: 404 });

  const gate = await accountGate();
  if (gate && "redirect" in gate) return NextResponse.redirect(gate.redirect);

  const access = await getBankAccess(PRO.institution, PRO.course);
  // Not bought and not on sale: the bank list shows the paid-access panel.
  if (!bankIsReachable(access)) return NextResponse.redirect(lockedUrl(req));

  const page = await getProPage(path);
  if (!page) return new NextResponse("Not found", { status: 404 });

  const kind = classifyPage(path);
  let mode: ProMode = "full";
  let semester: number | null = null;
  if (kind.kind === "mnemonics" || kind.kind === "notes") {
    semester = kind.semester;
    mode = semesterModeOf(access, semester);
  } else if (kind.kind === "sos") {
    semester = kind.semester;
    mode = semester ? semesterModeOf(access, semester) : generalModeOf(access);
  } else if (kind.kind === "taplets") {
    semester = page.taplet_semester;
    mode = semester ? semesterModeOf(access, semester) : "closed";
  }
  if (mode === "closed") return NextResponse.redirect(lockedUrl(req));

  // Navigation and data pages for an unbought semester say so up front; the
  // data itself is capped by POST below.
  const viewed = semesterParam(req.nextUrl.searchParams.get("semester"));
  const banner =
    (kind.kind === "data" || kind.kind === "shell") && viewed && semesterModeOf(access, viewed) === "sample"
      ? { semester: viewed, buyUrl: access.buyUrl }
      : null;

  const html = renderProPage(page.html, {
    path,
    sample: mode === "sample" ? { semester, buyUrl: access.buyUrl } : null,
    banner,
  });
  return new NextResponse(html, { headers: PRIVATE_HTML });
}

// ---------------------------------------------------------------------------
// Data

/** PostgREST's error shape, which the pages' clients already display. */
function fail(status: number, message: string) {
  return NextResponse.json({ code: String(status), message, details: null, hint: null }, { status });
}

export async function POST(req: NextRequest, { params }: Params) {
  const parts = params.path ?? [];
  const fn = parts.length === 5 && parts.slice(0, 4).join("/") === "_data/rest/v1/rpc" ? parts[4] : null;
  if (!fn) return fail(404, "Not found");

  // JSON only, and from this site: a cross-site form can neither set this
  // content type without a preflight nor forge the Origin.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(415, "Expected JSON");
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return fail(403, "Cross-site request refused");

  const gate = await accountGate();
  if (!gate) return fail(401, "Please sign in again.");
  if ("redirect" in gate) return fail(403, "This account cannot open the question bank.");
  const userId = gate.userId;

  const limited = await checkLimit("qbank", userId);
  if (limited) return fail(429, limited.error);

  const raw = await req.text();
  if (raw.length > 16_000) return fail(413, "Request too large");
  let args: Record<string, unknown>;
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    args = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON");
  }

  try {
    const decision = await decide(fn, args, {
      access: await getBankAccess(PRO.institution, PRO.course),
      examInfo: getExamInfo,
      sampleExams: getSampleExams,
      hasSubmitted: async (kind, id) => (await getAttempt(userId, kind, id)) != null,
    });
    if ("deny" in decision) return fail(decision.deny, decision.message);
    if ("empty" in decision) return NextResponse.json([]);
    if ("submit" in decision) return NextResponse.json(await submitAttempt(userId, decision.submit.kind, decision.submit.id));
    if ("score" in decision) {
      const s = decision.score;
      return NextResponse.json(await saveAttemptScore(userId, s.kind, s.id, s.score));
    }
    return NextResponse.json(await proRead(decision.read, decision.args));
  } catch (e) {
    console.error("[qbank-pro]", fn, e instanceof Error ? e.message : e);
    return fail(500, "The question bank could not be reached. Please try again.");
  }
}
