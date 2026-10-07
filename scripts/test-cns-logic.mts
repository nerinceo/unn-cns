// Pure-logic tests for the CNS-only helpers. Exercises the ACTUAL shipped
// modules (no re-implementation): JSON-LD embedding, HUB links, settle(),
// deterministic dates, LMS pricing/readiness, the Question Bank copy and its
// model-answer de-duplication, library cover art, the library contents list,
// the bank roll-up tallies and the small upload/env guards. No database, no
// network.
//
//   npx -y tsx scripts/test-cns-logic.mts
//
// Scope: only modules unique to CNS or whose content DIFFERS from HUB's copy.
// Files mirrored byte-for-byte with HUB (sanitize.ts, access.ts, errors.ts) are
// tested in HUB. Job matching / screening / salary / description HTML are
// covered by scripts/test-jobs-logic.mts and are not repeated here.
//
import Module from "node:module";
import { readFileSync, existsSync } from "node:fs";

// Several helpers live in server modules: `import "server-only"` (a marker Next
// resolves at build time, not an installed package) plus Supabase clients, Next
// request APIs and the bank-content readers, all of which need a request. The
// helpers tested here use none of them, so for this process only those imports
// resolve to an empty module. Nothing else is touched.
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
const EMPTY_MODULE = Module.createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js");
const SERVER_ONLY_DEPS =
  /^server-only$|lib[\\/]supabase[\\/](server|admin)|lib[\\/]cns[\\/](bank-content|taxonomy)|lib[\\/]users[\\/]own-contact|lib[\\/]r2[\\/]docs/;
M._resolveFilename = (req, ...rest) => {
  if (req === "server-only" || req === "next/cache" || req === "next/headers") return EMPTY_MODULE;
  const file = resolve(req, ...rest);
  return SERVER_ONLY_DEPS.test(file) ? EMPTY_MODULE : file;
};

// Modules that read env at LOAD time: pin a clean, known environment first.
for (const k of [
  "NEXT_PUBLIC_HUB_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET",
  "R2_PUBLIC_URL", "R2_VIDEO_BUCKET", "R2_DOCS_BUCKET", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_TOKEN",
  "RESEND_API_KEY", "QB_SOURCE",
]) delete process.env[k];

const { jsonLdHtml } = await import("@/lib/json-ld");
const { HUB_URL, hubLink, hubListing, hubReader } = await import("@/lib/hub");
const { settle } = await import("@/lib/utils/settle");
const { GENERIC_ERROR } = await import("@/lib/errors");
const { formatDate } = await import("@/lib/utils/date");
const lms = await import("@/lib/lms/index");
const qb = await import("@/lib/cns/question-bank-content");
const { categoryMotif, categoryPalette, categoryMesh, categoryDelay } = await import("@/lib/cns/library-visuals");
const { buildToc } = await import("@/lib/cns/library");
const { tallyBySemester, subjectsInSemester } = await import("@/lib/cns/nursing-bank");
type SemesterSubject = import("@/lib/cns/nursing-bank").SemesterSubject;
const { seedCoverage, EMPTY_CONTENT } = await import("@/lib/cns/resume");
const { bankSource } = await import("@/lib/cns/bank-source");
const { emailEnabled } = await import("@/lib/cns/notify");
const { isAllowedCoverType, isCoverStorageConfigured, COVER_MAX_BYTES } = await import("@/lib/lms/cover");
const video = await import("@/lib/lms/video");

let pass = 0;
let fail = 0;
const fails: string[] = [];
let current = "";
const perSection = new Map<string, number>();
function section(name: string) {
  current = name;
  perSection.set(name, 0);
  console.log(`\n=== ${name} ===`);
}
function eq(label: string, got: unknown, want: unknown) {
  perSection.set(current, (perSection.get(current) ?? 0) + 1);
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    fails.push(`✗ [${current}] ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
function threw(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// ── lib/json-ld.ts ──────────────────────────────────────────────────────────
section("json-ld: jsonLdHtml");
{
  // The embedding contract: the HTML parser must never see a tag, comment or
  // entity inside the script body, and the JSON VALUE must be unchanged.
  const hostile = {
    "@type": "JobPosting",
    title: '</script><script>alert(1)</script>',
    city: "<!-- x -->",
    employer: "Ward & Co </SCRIPT >",
    note: "line\u2028sep\u2029end",
    cdata: "]]><![CDATA[",
  };
  const out = jsonLdHtml(hostile);
  eq("no literal '<' survives", out.includes("<"), false);
  eq("no literal '>' survives", out.includes(">"), false);
  eq("no literal '&' survives", out.includes("&"), false);
  eq("no '</script' in any case", /<\/script/i.test(out), false);
  eq("no '<!--' comment opener", out.includes("<!--"), false);
  eq("U+2028 escaped", out.includes("\u2028"), false);
  eq("U+2029 escaped", out.includes("\u2029"), false);
  eq("'<' becomes \\u003c", out.includes("\\u003c/script\\u003e"), true);
  eq("value-identical after JSON.parse", JSON.parse(out), hostile);
  eq("is a single line of JSON", out.includes("\n"), false);
}
eq("plain object unchanged", jsonLdHtml({ a: 1, b: "x" }), '{"a":1,"b":"x"}');
eq("unicode passes through value-identical", JSON.parse(jsonLdHtml({ n: "नर्स — Ñurse 看护 🩺" })), { n: "नर्स — Ñurse 看护 🩺" });
eq("nested arrays escaped too", jsonLdHtml([["<b>"]]), '[["\\u003cb\\u003e"]]');
eq("quotes/backslashes stay valid JSON", JSON.parse(jsonLdHtml({ q: 'a"b\\c' })), { q: 'a"b\\c' });
eq("null serialises", jsonLdHtml(null), "null");
eq("string input escaped", jsonLdHtml("</script>"), '"\\u003c/script\\u003e"');
eq("numbers/booleans", jsonLdHtml({ n: 0, t: true }), '{"n":0,"t":true}');
// Signature promises `(data: unknown) => string`.
eq("undefined input does not throw (unknown → string)", threw(() => jsonLdHtml(undefined)), false);
{
  const t = '</script><img src=x onerror=alert(1)>';
  eq("injection payload round-trips", (JSON.parse(jsonLdHtml({ t })) as { t: string }).t, t);
}

// ── lib/hub.ts ──────────────────────────────────────────────────────────────
section("hub: links");
eq("default HUB origin", HUB_URL, "https://unn.nerusalem.com");
eq("hubLink() → root", hubLink(), "https://unn.nerusalem.com/");
eq("hubLink with leading slash", hubLink("/feed"), "https://unn.nerusalem.com/feed");
eq("hubLink adds missing slash", hubLink("feed"), "https://unn.nerusalem.com/feed");
eq("hubLink('') → root", hubLink(""), "https://unn.nerusalem.com/");
eq("hubLink keeps query", hubLink("/x?y=1"), "https://unn.nerusalem.com/x?y=1");
eq("hubLink('//evil.com') stays on HUB origin", new URL(hubLink("//evil.com")).origin, "https://unn.nerusalem.com");
eq("hubLink('evil.com') stays on HUB origin", new URL(hubLink("evil.com")).origin, "https://unn.nerusalem.com");
eq("hubListing", hubListing("abc-123"), "https://unn.nerusalem.com/marketplace/abc-123");
eq("hubReader default file 0", hubReader("abc"), "https://unn.nerusalem.com/marketplace/abc/read?f=0");
eq("hubReader file index", hubReader("abc", 3), "https://unn.nerusalem.com/marketplace/abc/read?f=3");
eq("hub links are absolute https", hubListing("x").startsWith("https://"), true);

// ── lib/utils/settle.ts ─────────────────────────────────────────────────────
section("settle");
{
  const origErr = console.error;
  const logged: unknown[][] = [];
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    eq("resolved value passes through", await settle(Promise.resolve({ ok: true })), { ok: true });
    eq("resolved {error} passes through untouched", await settle(Promise.resolve({ error: "Name taken" })), { error: "Name taken" });
    eq("throw → { error: GENERIC_ERROR }", await settle(Promise.reject(new Error("socket hang up"))), { error: GENERIC_ERROR });
    eq("non-Error rejection → generic", await settle(Promise.reject("boom")), { error: GENERIC_ERROR });
    eq("undefined rejection → generic", await settle(Promise.reject(undefined)), { error: GENERIC_ERROR });
    const leak = await settle<{ error?: string }>(Promise.reject(new Error('relation "users" violates policy')));
    eq("raw error message never reaches the client", leak.error?.includes("users"), false);
    eq("throws are logged (not swallowed silently)", logged.length, 3 + 1);
    eq("resolved undefined passes through", await settle(Promise.resolve(undefined)), undefined);
  } finally {
    console.error = origErr;
  }
  eq("GENERIC_ERROR is a user-facing sentence", GENERIC_ERROR, "Something went wrong. Please try again.");
}

// ── lib/utils/date.ts (differs from HUB: CNS has formatDate, HUB has event-zone helpers) ──
section("date: formatDate");
eq("ISO date → '07 Aug 2026'", formatDate("2026-08-07"), "07 Aug 2026");
eq("named month, day zero-padded", formatDate("2026-01-03T12:00:00Z"), "03 Jan 2026");
eq("pinned to UTC: late evening in Chicago is next day UTC", formatDate("2026-08-07T23:30:00-05:00"), "08 Aug 2026");
eq("pinned to UTC: early IST morning is previous day UTC", formatDate("2026-08-08T03:00:00+05:30"), "07 Aug 2026");
eq("Date instance", formatDate(new Date(Date.UTC(2026, 11, 31, 23, 59))), "31 Dec 2026");
eq("epoch number", formatDate(0), "01 Jan 1970");
eq("null → ''", formatDate(null), "");
eq("undefined → ''", formatDate(undefined), "");
eq("'' → ''", formatDate(""), "");
eq("garbage → ''", formatDate("not a date"), "");
eq("invalid Date → ''", formatDate(new Date("nope")), "");
eq("NaN → ''", formatDate(Number.NaN), "");
eq("'07/08/2026' ambiguity never re-emitted numerically", /\d+\/\d+/.test(formatDate("2026-08-07")), false);
// Doc example is a 3-letter month ("07 Aug 2026"). Every month must follow it,
// and must not depend on the runtime's CLDR version (that is the hydration
// mismatch this module exists to prevent).
eq("September uses the documented 3-letter form", formatDate("2026-09-15"), "15 Sep 2026");
eq("all 12 months are 3 letters", Array.from({ length: 12 }, (_, i) => formatDate(Date.UTC(2026, i, 1)).split(" ")[1].length), Array(12).fill(3));

// ── lib/lms/index.ts (differs from HUB: CNS hardcodes the commission, adds sellerReadiness) ──
section("lms: pricing");
eq("0 is a valid (free) price", lms.isValidCoursePrice(0), true);
eq("'0' string is free", lms.isValidCoursePrice("0"), true);
eq("'' is NOT free (untouched box)", lms.isValidCoursePrice(""), false);
eq("'   ' is NOT free", lms.isValidCoursePrice("   "), false);
eq("MIN boundary 1", lms.isValidCoursePrice(1), true);
eq("MAX boundary 999.99", lms.isValidCoursePrice(999.99), true);
eq("just over MAX", lms.isValidCoursePrice(1000), false);
eq("typo 99999 refused", lms.isValidCoursePrice(99999), false);
eq("between 0 and MIN refused", lms.isValidCoursePrice(0.5), false);
eq("negative refused", lms.isValidCoursePrice(-5), false);
eq("whole cents ok", lms.isValidCoursePrice(24.99), true);
eq("float-noisy cents ok (19.99)", lms.isValidCoursePrice(19.99), true);
eq("float-noisy cents ok (4.35)", lms.isValidCoursePrice(4.35), true);
eq("third decimal refused", lms.isValidCoursePrice(24.999), false);
eq("1.005 refused", lms.isValidCoursePrice(1.005), false);
eq("'24.99' string ok", lms.isValidCoursePrice("24.99"), true);
eq("'abc' refused", lms.isValidCoursePrice("abc"), false);
eq("NaN refused", lms.isValidCoursePrice(Number.NaN), false);
eq("Infinity refused", lms.isValidCoursePrice(Infinity), false);
eq("null refused", lms.isValidCoursePrice(null), false);
eq("undefined refused", lms.isValidCoursePrice(undefined), false);
eq("boolean refused", lms.isValidCoursePrice(true), false);
eq("object refused", lms.isValidCoursePrice({}), false);
eq("price hint wording", lms.COURSE_PRICE_HINT, "Enter 0 for a free course, or a price between $1 and $999.99.");
eq("commission 5%", lms.LMS_COMMISSION_BPS, 500);
eq("instructor share 95%", lms.INSTRUCTOR_SHARE_PERCENT, 95);
eq("earnings on $100 → $95", lms.instructorEarnings(100), 95);
eq("earnings on $24.99 → $23.74 (fee rounds to the cent)", lms.instructorEarnings(24.99), 23.74);
eq("earnings on free → 0", lms.instructorEarnings(0), 0);
eq("earnings on MAX", lms.instructorEarnings(999.99), 949.99);
eq("earnings never exceed price", [1, 9.99, 49.5, 999.99].every((p) => lms.instructorEarnings(p) <= p), true);
{
  // "MUST MATCH DEFAULT_COMMISSION_BPS.lms in HUB's lib/marketplace/index.ts"
  const hubFile = "D:/2026/unn-platform/lib/marketplace/index.ts";
  if (existsSync(hubFile)) {
    const m = readFileSync(hubFile, "utf8").match(/\blms:\s*(\d+)/);
    eq("commission matches HUB DEFAULT_COMMISSION_BPS.lms", m ? Number(m[1]) : null, lms.LMS_COMMISSION_BPS);
  } else console.log("  (HUB repo not found — commission drift check skipped)");
}

section("lms: vocabularies");
eq("category guard accepts a real category", lms.isLmsCategory("Clinical Skills"), true);
eq("category guard is exact (case)", lms.isLmsCategory("clinical skills"), false);
eq("category guard rejects non-string", lms.isLmsCategory(5), false);
eq("'Other' is last", lms.LMS_CATEGORIES[lms.LMS_CATEGORIES.length - 1], "Other");
eq("IEN pathway leads", lms.LMS_CATEGORIES[0], "Exam Prep (NCLEX, CBT, OSCE)");
eq("doc type guard", [lms.isLmsDocType("cv"), lms.isLmsDocType("passport"), lms.isLmsDocType(null)], [true, false, false]);
eq("doc type guard ignores prototype keys", lms.isLmsDocType("toString"), false);
eq("doc label known", lms.lmsDocLabel("degree"), "Degree or qualification");
eq("doc label unknown falls back to slug", lms.lmsDocLabel("xyz"), "xyz");
eq("required docs = license + degree", lms.REQUIRED_LMS_DOC_TYPES, ["nursing_license", "degree"]);
eq("missing docs: null → both", lms.missingRequiredDocs(null), ["nursing_license", "degree"]);
eq("missing docs: have license", lms.missingRequiredDocs([{ doc_type: "nursing_license" }, { doc_type: "cv" }]), ["degree"]);
eq("missing docs: complete", lms.missingRequiredDocs([{ doc_type: "degree" }, { doc_type: "nursing_license" }]), []);
eq("levels start with 'All levels'", lms.LMS_LEVELS[0], { value: "all", label: "All levels" });

section("lms: courseReadiness");
{
  const full = { title: "ICU Basics", subtitle: "Learn", cover_url: "https://x/c.png", what_you_learn: ["a", "b", "c", "d"], lecture_count: 5 };
  const lects = [{ kind: "video", is_preview: true, video_status: "ready" }, { kind: "article", is_preview: false }];
  const r = lms.courseReadiness(full, lects);
  eq("complete course is ready", r.ready, true);
  eq("doneCount = 6", r.doneCount, 6);
  eq("item keys in order", r.items.map((i) => i.key), ["basics", "outcomes", "cover", "lectures", "preview", "media"]);
  const done = (c: object, l = lects) => Object.fromEntries(lms.courseReadiness({ ...full, ...c }, l).items.map((i) => [i.key, i.done]));
  eq("whitespace title not done", done({ title: "   " }).basics, false);
  eq("missing subtitle not done", done({ subtitle: null }).basics, false);
  eq("blank outcomes don't count", done({ what_you_learn: ["a", " ", "", "b", "c"] }).outcomes, false);
  eq("null outcomes not done", done({ what_you_learn: null }).outcomes, false);
  eq("no cover not done", done({ cover_url: "" }).cover, false);
  eq("4 lectures not enough", done({ lecture_count: 4 }).lectures, false);
  eq("null lecture_count not done", done({ lecture_count: null }).lectures, false);
  eq("no preview lecture not done", done({}, [{ kind: "article", is_preview: false }]).preview, false);
  eq("processing video blocks", done({}, [{ kind: "video", is_preview: true, video_status: "processing" }]).media, false);
  eq("video with no status blocks", done({}, [{ kind: "video", is_preview: true }]).media, false);
  eq("article-only course needs no video", done({}, [{ kind: "article", is_preview: true }]).media, true);
  eq("no minimum duration (text course with 0s is fine)", lms.courseReadiness({ ...full, total_duration_s: 0 }, lects).ready, true);
  eq("empty course: nothing but media done", lms.courseReadiness({}, []).doneCount, 1);
}

section("lms: sellerReadiness");
{
  const base = {
    status: "approved", displayName: "Asha", headline: "ICU nurse educator", bio: "x".repeat(100),
    expertise: ["Critical Care / ICU"], agreementAcceptedAt: "2026-09-01", documents: [{ doc_type: "nursing_license" }, { doc_type: "degree" }],
    payoutsConnected: true, approvedCourseCount: 1, hasPaidCourse: true,
  };
  const r = lms.sellerReadiness(base);
  eq("everything done → 100% and can sell", [r.percent, r.canSell, r.doneCount], [100, true, 6]);
  eq("step order", r.steps.map((s) => s.key), ["profile", "credentials", "agreement", "approved", "payouts", "course"]);
  const step = (o: object, k: string) => lms.sellerReadiness({ ...base, ...o }).steps.find((s) => s.key === k)!;
  eq("99-char bio not done", step({ bio: "x".repeat(99) }, "profile").done, false);
  eq("bio padded with spaces to 100 not done", step({ bio: " ".repeat(10) + "x".repeat(90) }, "profile").done, false);
  eq("blank display name not done", step({ displayName: "  " }, "profile").done, false);
  // The step's own detail is the instructions shown to the instructor:
  // "Display name, headline and a bio of at least 100 characters."
  eq("profile done when the detail's three asks are met (expertise not mentioned)", step({ expertise: [] }, "profile").done, true);
  eq("profile/credentials never block selling", [step({}, "profile").blocksSelling, step({}, "credentials").blocksSelling], [false, false]);
  eq("no agreement → cannot sell", lms.sellerReadiness({ ...base, agreementAcceptedAt: null }).canSell, false);
  eq("not approved → cannot sell", lms.sellerReadiness({ ...base, status: "pending" }).canSell, false);
  eq("no approved course → cannot sell", lms.sellerReadiness({ ...base, approvedCourseCount: 0 }).canSell, false);
  eq("paid course without payouts → cannot sell", lms.sellerReadiness({ ...base, payoutsConnected: false }).canSell, false);
  eq("FREE course without payouts → can sell", lms.sellerReadiness({ ...base, payoutsConnected: false, hasPaidCourse: false }).canSell, true);
  eq("incomplete profile does not stop selling", lms.sellerReadiness({ ...base, bio: "", documents: [] }).canSell, true);
  eq("percent rounds (1 of 6 → 17)", lms.sellerReadiness({ status: "x", payoutsConnected: true, approvedCourseCount: 0, hasPaidCourse: false }).percent, 17);
  eq("nothing done → 0%", lms.sellerReadiness({ status: "pending", payoutsConnected: false, approvedCourseCount: 0, hasPaidCourse: false }).percent, 0);
  eq("every step says where to fix it", r.steps.every((s) => !!s.where && !!s.detail), true);
  eq("seller copy says Nerusalem, never UNN", r.steps.some((s) => /\bUNN\b/.test(s.label + s.detail)), false);
}

section("lms: formatting");
eq("duration 0", lms.formatDuration(0), "0:00");
eq("duration 372 → 6:12", lms.formatDuration(372), "6:12");
eq("duration 3870 → 1:04:30", lms.formatDuration(3870), "1:04:30");
eq("duration null → 0:00", lms.formatDuration(null), "0:00");
eq("duration negative clamps", lms.formatDuration(-5), "0:00");
eq("duration fractional floors", lms.formatDuration(59.9), "0:59");
eq("length 12000 → 3h 20m", lms.formatCourseLength(12000), "3h 20m");
eq("length 3600 → 1h", lms.formatCourseLength(3600), "1h");
eq("length 600 → 10m", lms.formatCourseLength(600), "10m");
eq("length null → 0m", lms.formatCourseLength(null), "0m");
eq("length 3599 rounds up to 1h, not '60m'", lms.formatCourseLength(3599), "1h");
eq("length 7170 → 2h, never '1h 60m'", lms.formatCourseLength(7170), "2h");
eq("minutes part never reaches 60", [3570, 3599, 7199, 10799].every((s) => !/\b60m/.test(lms.formatCourseLength(s))), true);
eq("slug basic", lms.courseSlug("ICU Basics: Part 1!", "ab12"), "icu-basics-part-1-ab12");
eq("slug trims edge punctuation", lms.courseSlug("  --Hello, World--  ", "x"), "hello-world-x");
eq("slug non-latin falls back to 'course'", lms.courseSlug("नर्सिंग देखभाल", "x"), "course-x");
eq("slug empty falls back", lms.courseSlug("", "x"), "course-x");
eq("slug base capped at 60", lms.courseSlug("a".repeat(100), "x"), "a".repeat(60) + "-x");
eq("slug is URL-safe for hostile input", /^[a-z0-9-]+$/.test(lms.courseSlug('<script>"x"</script>/../é', "s1")), true);

// ── lib/cns/question-bank-content.ts ────────────────────────────────────────
section("question-bank-content: labels");
eq("marks never singularise (1 marks)", qb.marksLabel(1), "1 marks");
eq("marks plural", qb.marksLabel(5), "5 marks");
eq("questions never singularise", qb.questionCountLabel(1), "1 questions");
eq("question count", qb.questionCountLabel(1097), "1097 questions");
eq("list title uses a hyphen, not en-dash", qb.questionListTitle("RGUHS", "B.Sc Nursing", 1), "RGUHS B.Sc Nursing - Semester 1");
eq("list title semester string", qb.questionListTitle("RGUHS", "B.Sc Nursing", "3"), "RGUHS B.Sc Nursing - Semester 3");
eq("showing label", qb.showingLabel(25, 1097), "Showing 25 of 1097 questions");
eq("count pill", qb.countPillLabel(1097), "Questions: 1097");
eq("subject option", qb.subjectOptionLabel("Applied Anatomy and Physiology", 411), "Applied Anatomy and Physiology (411)");
eq("footer uses middot", qb.bankFooter("RGUHS B.Sc Nursing"), "Nursing Bank by Nerusalem · RGUHS B.Sc Nursing");
eq("metaChain drops null/undefined/''", qb.metaChain(["RGUHS", null, "2024", undefined, "", "Unit 3"]), "RGUHS · 2024 · Unit 3");
eq("metaChain keeps 0 (a value, not empty)", qb.metaChain(["Q", 0]), "Q · 0");
eq("metaChain empty → ''", qb.metaChain([]), "");
eq("metaChain all empty → ''", qb.metaChain([null, undefined, ""]), "");
eq("metaChain numbers", qb.metaChain([2024, 10]), "2024 · 10");

section("question-bank-content: copy & directory");
eq("inline answer labels carry colons", Object.values(qb.ANSWER_LABELS_INLINE).every((s) => s.endsWith(":")), true);
eq("heading answer labels carry no colons", Object.values(qb.ANSWER_LABELS_HEADING).some((s) => s.includes(":")), false);
eq("same four answer fields in both forms", Object.keys(qb.ANSWER_LABELS_INLINE), Object.keys(qb.ANSWER_LABELS_HEADING));
eq("forward CTA keeps → glyph", qb.DIRECTORY_COPY.cardCta, "View Question Bank →");
eq("every back link starts with ←", [qb.ACCESS_COPY.backToDirectory, qb.COURSE_PICKER_COPY.back, qb.SEMESTER_PICKER_COPY.back, qb.QUESTION_LIST_COPY.back, qb.QUESTION_DETAIL_COPY.back].every((s) => s.startsWith("← ")), true);
{
  const banks = qb.BANK_DIRECTORY.flatMap((g) => g.banks);
  eq("20 directory banks (RGUHS + 19 coming soon)", banks.length, 20);
  eq("bank keys unique", new Set(banks.map((b) => b.key)).size, banks.length);
  eq("exactly one rguhs", banks.filter((b) => b.key === "rguhs").length, 1);
  eq("rguhs is the first card", banks[0].key, "rguhs");
  eq("bank keys are URL-safe slugs", banks.every((b) => /^[a-z0-9-]+$/.test(b.key)), true);
  eq("curly apostrophe in Cebu Doctors’", banks.find((b) => b.key === "cebu-doctors")!.name, "Cebu Doctors’ University Question Bank");
  eq("curly apostrophe in King’s", banks.find((b) => b.key === "kcl")!.name, "King’s College London Question Bank");
  eq("no straight apostrophes in bank names", banks.some((b) => b.name.includes("'")), false);
  eq("country order matches directory subtitle", qb.BANK_DIRECTORY.map((g) => g.country), ["India", "Philippines", "Africa", "USA", "Australia", "Canada", "UK"]);
  eq("subtitle names every country", qb.BANK_DIRECTORY.every((g) => qb.DIRECTORY_COPY.subtitle.includes(g.country)), true);
  eq("Indian banks acronym-named", qb.BANK_DIRECTORY[0].banks.filter((b) => b.key !== "tnmgr").every((b) => /^[A-Z]{4,5} /.test(b.name)), true);
  eq("every bank has location + description", banks.every((b) => b.location && b.description), true);
}
eq("only B.Sc Nursing is available", qb.COURSES.filter((c) => c.available).map((c) => c.key), ["bsc-nursing"]);
eq("course keys unique", new Set(qb.COURSES.map((c) => c.key)).size, qb.COURSES.length);
eq("semesters 1..8 in order", qb.SEMESTERS.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8]);
eq("semester names match numbers", qb.SEMESTERS.every((s) => s.name === `Semester ${s.number}`), true);
eq("not-open state is 'Coming Soon', not 'Access Restricted'", [qb.ACCESS_COPY.badge, qb.ACCESS_COPY.heading], ["Coming Soon", "Coming Soon"]);
eq("identity", qb.BANK_IDENTITY.attribution, "Nursing Bank by Nerusalem");
{
  // Brand rule: public copy says Nerusalem, never "UNN"; no emoji in UI copy.
  const all: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const [, v] of Object.entries(qb)) if (typeof v !== "function") walk(v);
  eq("no 'UNN' in any public copy", all.filter((s) => /\bUNN\b/.test(s)), []);
  eq("no emoji in any copy", all.filter((s) => /\p{Extended_Pictographic}/u.test(s)), []);
  eq("no double spaces / stray whitespace", all.filter((s) => s !== s.trim() || / {2}/.test(s)), []);
}

section("question-bank-content: dedupeModelAnswer");
{
  const ans = "Correct Answer: A. Encoding, Storage, Retrieval\nRationale: The information processing model describes memory as three stages.";
  const rat = "The information processing model describes memory as three stages.";
  eq("exact duplicate tail is stripped", qb.dedupeModelAnswer(ans, rat), "Correct Answer: A. Encoding, Storage, Retrieval");
  eq("'Correct Answer' line kept", qb.dedupeModelAnswer(ans, rat)?.startsWith("Correct Answer: A."), true);
  eq("differing tail kept (both are content)", qb.dedupeModelAnswer(ans, "A different rationale."), ans);
  eq("empty rationale column → tail kept", qb.dedupeModelAnswer(ans, ""), ans);
  eq("null rationale column → tail kept", qb.dedupeModelAnswer(ans, null), ans);
  eq("null answer → null", qb.dedupeModelAnswer(null, rat), null);
  eq("undefined answer → null", qb.dedupeModelAnswer(undefined, rat), null);
  eq("no Rationale tail → unchanged", qb.dedupeModelAnswer("Correct Answer: B", rat), "Correct Answer: B");
  eq("answer that IS only the rationale is never emptied", qb.dedupeModelAnswer("Rationale: " + rat, rat), "Rationale: " + rat);
  eq("leading-newline-only head is never emptied", qb.dedupeModelAnswer("\nRationale: " + rat, rat), "\nRationale: " + rat);
  eq("inline 'Rationale:' (no line break) is not a tail", qb.dedupeModelAnswer("See Rationale: " + rat, rat), "See Rationale: " + rat);
  eq("CRLF line endings handled", qb.dedupeModelAnswer("Correct Answer: C\r\nRationale: " + rat, rat), "Correct Answer: C");
  eq("RATIONALE: label case-insensitive", qb.dedupeModelAnswer("Correct Answer: C\nRATIONALE: " + rat, rat), "Correct Answer: C");
  eq("trailing whitespace on tail tolerated", qb.dedupeModelAnswer("Correct Answer: C\nRationale: " + rat + "  \n", rat), "Correct Answer: C");
  eq("multi-line head kept intact", qb.dedupeModelAnswer("Line 1\nLine 2\nRationale: " + rat, rat), "Line 1\nLine 2");
  eq("longer tail (extra sentence) kept", qb.dedupeModelAnswer(ans + " Also X.", rat), ans + " Also X.");
  eq("prefix of column is not a duplicate", qb.dedupeModelAnswer("A\nRationale: The information", rat), "A\nRationale: The information");
  eq("unicode rationale", qb.dedupeModelAnswer("A\nRationale: रक्तचाप — 120/80 mmHg", "रक्तचाप — 120/80 mmHg"), "A");
  eq("HTML in answer passes through untouched (no stripping here)", qb.dedupeModelAnswer("<b>A</b>\nRationale: x", "y"), "<b>A</b>\nRationale: x");
  // Documented: "this only ever removes a byte-for-byte repeat".
  eq("case-only difference is not a byte-for-byte repeat → kept", qb.dedupeModelAnswer("A\nRationale: the information processing model describes memory as three stages.", rat),
    "A\nRationale: the information processing model describes memory as three stages.");
}

// ── lib/cns/library-visuals.ts ──────────────────────────────────────────────
section("library-visuals: categoryMotif");
const motifCases: Array<[string, string]> = [
  ["Blood Tests", "blood"],          // blood before generic /test/
  ["ECG Basics", "ecg"],             // not swallowed by a /basic/ document rule
  ["Cardiac Markers", "ecg"],
  ["CT Scan", "imaging"],
  ["Chest X-Ray", "imaging"],
  ["Microbiology Cultures", "micro"],
  ["Urine Analysis", "lab"],
  ["Respiratory Care", "breath"],
  ["Mental Health", "neuro"],
  ["Orthopaedic Nursing", "bone"],
  ["Neonatal Care", "infant"],
  ["Vital Signs", "vitals"],
  ["Pharmacology", "pill"],
  ["IV Therapy", "syringe"],
  ["Critical Values", "shield"],     // shield above chart on purpose
  ["Normal Lab Values", "chart"],    // chart above generic lab on purpose
  ["Reference Ranges", "chart"],
  ["Lab Tests", "lab"],
  ["Dosage Calculations", "calc"],
  ["Unit Conversion", "calc"],
  ["Medical Abbreviations", "abbrev"],
  ["Case Studies", "doc"],
  ["Procedures", "doc"],             // protocol drawing, not the heart
  ["Fundamentals", "abstract"],      // deliberately no rule
  ["Introduction", "abstract"],
  ["Principles", "abstract"],
  ["", "abstract"],
  ["नर्सिंग", "abstract"],
];
for (const [name, want] of motifCases) eq(`"${name}" → ${want}`, categoryMotif(name), want);
eq("'Bile Duct' is not imaging (\\bct\\b)", categoryMotif("Bile Duct") === "imaging", false);
eq("'Fundamentals' is not neuro (\\bmental\\b)", categoryMotif("Fundamentals of Nursing") === "neuro", false);
eq("'Community Health' is not calc (\\bunits?\\b)", categoryMotif("Community Health") === "calc", false);
eq("case-insensitive", categoryMotif("BLOOD TRANSFUSION"), "blood");

section("library-visuals: palette / mesh / delay");
{
  const seeds = Array.from({ length: 600 }, (_, i) => `Category ${i} ${String.fromCharCode(65 + (i % 26))}${i * 7919}`)
    .concat(["Procedures", "Lab Values", "नर्सिंग", "", "🩺", "a".repeat(5000)]);
  eq("deterministic palette", categoryPalette("Procedures"), categoryPalette("Procedures"));
  eq("deterministic mesh", categoryMesh("Lab Values"), categoryMesh("Lab Values"));
  eq("deterministic delay", categoryDelay("Lab Values"), categoryDelay("Lab Values"));
  const pals = new Map<string, ReturnType<typeof categoryPalette>>();
  for (const s of seeds) { const p = categoryPalette(s); pals.set(p.deep, p); }
  eq("all 8 palettes reachable", pals.size, 8);
  eq("every palette colour is #rrggbb", [...pals.values()].every((p) => Object.values(p).every((c) => /^#[0-9a-f]{6}$/.test(c))), true);
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);
  eq("every `deep` (title backdrop) clears 7:1 vs white", [...pals.values()].filter((p) => contrastWhite(p.deep) < 7).map((p) => p.deep), []);
  eq("mesh never contains undefined/NaN", seeds.some((s) => /undefined|NaN/.test(categoryMesh(s))), false);
  eq("mesh has 3 radial + 1 linear layer", (categoryMesh("x").match(/radial-gradient/g) ?? []).length * 10 + (categoryMesh("x").match(/linear-gradient/g) ?? []).length, 31);
  eq("seed is hashed, never interpolated (CSS injection)", categoryMesh("red;}</style><script>").includes("script"), false);
  // Offsets are 12+[0,24), 8+[0,18), 68+[0,26), 145°+[0,40) — fixed bands so
  // every cover keeps its glow in the same corner region.
  const bad: string[] = [];
  for (const s of seeds) {
    const mesh = categoryMesh(s);
    const x2 = Number(mesh.match(/at (-?\d+)% 4%/)![1]);
    const [, x1, y1] = mesh.match(/85% 75% at (-?\d+)% (-?\d+)%/)!.map(Number);
    const angle = Number(mesh.match(/linear-gradient\((-?\d+)deg/)![1]);
    if (!(x1 >= 12 && x1 < 36 && y1 >= 8 && y1 < 26 && x2 >= 68 && x2 < 94 && angle >= 145 && angle < 185)) bad.push(`${s}: x1=${x1} y1=${y1} x2=${x2} angle=${angle}`);
  }
  eq("all mesh offsets inside their designed bands", bad.length, 0);
  if (bad.length) console.log(`  e.g. ${bad[0]}  (${bad.length}/${seeds.length} seeds out of band)`);
  const delays = seeds.map((s) => categoryDelay(s));
  eq("delay format '-N.Ns'", delays.every((d) => /^-\d+(\.\d)?s$/.test(d)), true);
  eq("delay within 0..10.9s", delays.every((d) => { const n = -parseFloat(d); return n >= 0 && n <= 10.9; }), true);
  eq("delays actually stagger", new Set(delays).size > 50, true);
}

// ── lib/cns/library.ts: buildToc ────────────────────────────────────────────
section("library: buildToc");
eq("null → empty", buildToc(null), { html: "", toc: [] });
eq("'' → empty", buildToc(""), { html: "", toc: [] });
eq("no headings → html unchanged", buildToc("<p>Hi</p>"), { html: "<p>Hi</p>", toc: [] });
eq("ids from heading text", buildToc("<h2>Normal Range</h2><p>x</p><h2>Critical Values</h2>"), {
  html: '<h2 id="normal-range">Normal Range</h2><p>x</p><h2 id="critical-values">Critical Values</h2>',
  toc: [{ id: "normal-range", text: "Normal Range" }, { id: "critical-values", text: "Critical Values" }],
});
eq("duplicate headings get numeric suffixes", buildToc("<h2>Overview</h2><h2>Overview</h2><h2>Overview</h2>").toc.map((t) => t.id), ["overview", "overview-2", "overview-3"]);
eq("ids unique across the article", (() => { const ids = buildToc("<h2>A B</h2><h2>A-B</h2><h2>a b</h2>").toc.map((t) => t.id); return new Set(ids).size === ids.length; })(), true);
eq("inner tags stripped from toc text, kept in html", buildToc("<h2><strong>Purpose</strong></h2>"), {
  html: '<h2 id="purpose"><strong>Purpose</strong></h2>', toc: [{ id: "purpose", text: "Purpose" }],
});
eq("existing attributes preserved", buildToc('<h2 class="x">Purpose</h2>').html, '<h2 class="x" id="purpose">Purpose</h2>');
eq("uppercase H2 matched", buildToc("<H2>Purpose</H2>").toc, [{ id: "purpose", text: "Purpose" }]);
eq("empty heading left untouched, not listed", buildToc("<h2>  </h2>"), { html: "<h2>  </h2>", toc: [] });
eq("h3 not listed (flat one-level list)", buildToc("<h3>Sub</h3>").toc, []);
eq("whitespace collapsed in toc text", buildToc("<h2>Normal\n   Range</h2>").toc[0].text, "Normal Range");
eq("non-latin heading → 'section' id", buildToc("<h2>सामान्य सीमा</h2>").toc[0].id, "section");
eq("id capped at 60 chars", buildToc(`<h2>${"a".repeat(80)}</h2>`).toc[0].id.length, 60);
eq("hostile heading text cannot break out of the id attribute", /^[a-z0-9-]+$/.test(buildToc('<h2>x" onmouseover="alert(1)</h2>').toc[0].id), true);
// The TOC renders item.text as a React text node (escaped). Entity-encoded
// heading text from sanitized HTML must come out as the reader sees it.
eq("entities decoded in toc text (&amp; shows as &)", buildToc("<h2>Fluids &amp; Electrolytes</h2>").toc[0].text, "Fluids & Electrolytes");

// ── lib/cns/nursing-bank.ts: roll-up tallies ────────────────────────────────
section("nursing-bank: tallies");
{
  const s = (id: string, name: string, semester: number | null, total: number): SemesterSubject =>
    ({ id, name, semester, descriptiveCount: total, mcqCount: 0, total });
  const rollup = [s("1", "Zoology", 1, 10), s("2", "Anatomy", 1, 5), s("3", "Pharmacology", 2, 7), s("4", "Orphan", null, 99), s("5", "Empty", 2, 0)];
  const t = tallyBySemester(rollup);
  eq("sums per semester", [t.get(1), t.get(2)], [15, 7]);
  eq("null semester never counted", [...t.keys()].sort(), [1, 2]);
  eq("grand total excludes unplaced subjects", [...t.values()].reduce((a, b) => a + b, 0), 22);
  eq("empty roll-up → empty map", tallyBySemester([]).size, 0);
  eq("semester present with zero content → 0", tallyBySemester([s("x", "X", 3, 0)]).get(3), 0);
  eq("rail: only that semester, sorted by name", subjectsInSemester(rollup, 1).map((x) => x.name), ["Anatomy", "Zoology"]);
  eq("rail: zero-count subjects hidden", subjectsInSemester(rollup, 2).map((x) => x.name), ["Pharmacology"]);
  eq("rail: unknown semester → []", subjectsInSemester(rollup, 9), []);
  eq("rail does not mutate input order", rollup.map((x) => x.id), ["1", "2", "3", "4", "5"]);
}

// ── lib/cns/resume.ts: seedCoverage ─────────────────────────────────────────
section("resume: seedCoverage");
eq("EMPTY_CONTENT is essentially empty", seedCoverage(EMPTY_CONTENT).isEssentiallyEmpty, true);
eq("whitespace summary is not a summary", seedCoverage({ ...EMPTY_CONTENT, summary: "   " }), { hasSummary: false, experience: 0, education: 0, skills: 0, isEssentiallyEmpty: true });
eq("summary alone makes it non-empty", seedCoverage({ ...EMPTY_CONTENT, summary: "ICU nurse" }).isEssentiallyEmpty, false);
eq("skills alone make it non-empty", seedCoverage({ ...EMPTY_CONTENT, skills: ["BLS"] }), { hasSummary: false, experience: 0, education: 0, skills: 1, isEssentiallyEmpty: false });
eq("counts experience/education", seedCoverage({ ...EMPTY_CONTENT, experience: [{} as never, {} as never], education: [{} as never] }).experience, 2);
eq("EMPTY_CONTENT has no name", EMPTY_CONTENT.header.full_name, "");

// ── env switches & upload guards ────────────────────────────────────────────
section("env switches & upload guards");
eq("bank source defaults to legacy", bankSource(), "legacy");
process.env.QB_SOURCE = "content";
eq("QB_SOURCE=content → content", bankSource(), "content");
process.env.QB_SOURCE = "CONTENT";
eq("anything else (even 'CONTENT') → legacy", bankSource(), "legacy");
delete process.env.QB_SOURCE;
eq("email off without a key", emailEnabled(), false);
process.env.RESEND_API_KEY = "re_test";
eq("email on with a key", emailEnabled(), true);
process.env.RESEND_API_KEY = "";
eq("empty key is off", emailEnabled(), false);
delete process.env.RESEND_API_KEY;
eq("stream off by default → r2", [video.isStreamConfigured(), video.videoProvider()], [false, "r2"]);
process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
eq("half-configured Stream is NOT configured", video.videoProvider(), "r2");
process.env.CLOUDFLARE_STREAM_TOKEN = "tok";
eq("fully configured Stream → stream", video.videoProvider(), "stream");
delete process.env.CLOUDFLARE_ACCOUNT_ID;
delete process.env.CLOUDFLARE_STREAM_TOKEN;
eq("cover storage not configured with no env", isCoverStorageConfigured(), false);
eq("video storage not configured with no env", video.isVideoStorageConfigured(), false);
eq("cover max 5 MB", COVER_MAX_BYTES, 5 * 1024 * 1024);
eq("video max 2 GB", video.VIDEO_MAX_BYTES, 2 * 1024 ** 3);
eq("cover allows jpeg/png/webp", ["image/jpeg", "image/png", "image/webp"].map(isAllowedCoverType), [true, true, true]);
eq("cover refuses SVG (script-capable)", isAllowedCoverType("image/svg+xml"), false);
eq("cover refuses gif/html/empty", ["image/gif", "text/html", ""].map(isAllowedCoverType), [false, false, false]);
eq("cover type is exact (case)", isAllowedCoverType("IMAGE/PNG"), false);
eq("cover refuses prototype keys", ["toString", "constructor", "__proto__", "hasOwnProperty"].map(isAllowedCoverType), [false, false, false, false]);
eq("video allows mp4/mov/webm/m4v", ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"].map(video.isAllowedVideoType), [true, true, true, true]);
eq("video refuses others", ["video/x-msvideo", "image/png", "", "toString"].map(video.isAllowedVideoType), [false, false, false, false]);
eq("video hint", video.VIDEO_TYPE_HINT, "MP4, MOV or WebM");
{
  const k = video.makeVideoKey("course-1", "Lecture 1.MOV");
  eq("video key namespaced lms-video/<course>/", k.startsWith("lms-video/course-1/"), true);
  eq("video key extension lower-cased", k.endsWith(".mov"), true);
  eq("video key ignores the uploaded basename", k.includes("Lecture"), false);
  eq("hostile extension sanitised", /^lms-video\/c\/[0-9]+-[a-z0-9]+\.[a-z0-9]{1,8}$/.test(video.makeVideoKey("c", "x.mp4/../../etc<script>")), true);
  eq("over-long extension falls back to mp4", video.makeVideoKey("c", "x.abcdefghijk").endsWith(".mp4"), true);
  eq("punctuation-only extension falls back to mp4", video.makeVideoKey("c", "x.%%%").endsWith(".mp4"), true);
  eq("keys are unique per call", video.makeVideoKey("c", "a.mp4") !== video.makeVideoKey("c", "a.mp4"), true);
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log("\nchecks per section:");
for (const [name, n] of perSection) console.log(`  ${String(n).padStart(4)}  ${name}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of fails) console.log(f);
  process.exit(1);
}
