// Pure-logic tests for the jobs board. Exercises the ACTUAL shipped helpers
// (no re-implementation) — match scoring, knockout screening, salary display,
// description HTML, sort/country helpers. No database, no network.
//
//   npm run check:jobs
//
import Module from "node:module";
import { scoreJobMatch, normaliseSeekerVocabulary, matchTone, RECOMMEND_THRESHOLD, type MatchableJob, type MatchableSeeker, type VocabMaps } from "@/lib/cns/job-match";
import { evaluateScreening, type ScreeningQuestion, type ScreeningAnswer } from "@/lib/cns/screening";
import { isJobSort, JOB_SORTS, JOBS_PAGE_SIZE, toCountryCode, EMPLOYMENT_TYPE_SCHEMA, EMPLOYMENT_TYPE_LABEL } from "@/lib/cns/job-constants";
import type { CnsJob } from "@/lib/cns/jobs";

// lib/cns/jobs.ts is a server module: `import "server-only"` (a marker Next
// resolves at build time, not an installed package) plus the Supabase client
// and the taxonomy lookups, which need a request. formatSalary() and
// jobDescriptionHtml() are pure and use none of them, so for this process only
// those three imports resolve to an empty module. Nothing else is touched.
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
const EMPTY_MODULE = Module.createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js");
const SERVER_ONLY_DEPS = /^server-only$|lib[\\/]supabase[\\/]server|lib[\\/]cns[\\/]taxonomy/;
M._resolveFilename = (req, ...rest) => {
  if (req === "server-only") return EMPTY_MODULE;
  const file = resolve(req, ...rest);
  return SERVER_ONLY_DEPS.test(file) ? EMPTY_MODULE : file;
};
const { formatSalary, jobDescriptionHtml } = await import("@/lib/cns/jobs");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    fails.push(`✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const job = (o: Partial<MatchableJob> = {}): MatchableJob => ({
  nursing_role: "staff-nurse", specialty: "icu-critical-care", country: "united-kingdom", employment_type: "full_time",
  work_setting: "hospital", experience_min_years: 2, license_required: false, is_remote: false, visa_sponsorship: false, ...o,
});
const seeker = (o: Partial<MatchableSeeker> = {}): MatchableSeeker => ({
  nursing_role: "staff-nurse", specialties: ["icu-critical-care"], total_years: 5, licence_country: "united-kingdom", licence_status: "active",
  preferred_countries: ["united-kingdom"], preferred_roles: [], preferred_employment_types: ["full_time"], preferred_work_settings: ["hospital"], ...o,
});
const EMPTY: MatchableSeeker = { nursing_role: null, specialties: [], total_years: null, licence_country: null, licence_status: null,
  preferred_countries: [], preferred_roles: [], preferred_employment_types: [], preferred_work_settings: [] };

// ── match scoring ───────────────────────────────────────────────────────────
console.log("\n=== scoreJobMatch ===");
{
  const r = scoreJobMatch(job(), seeker());
  eq("perfect fit → 100%", r.percent, 100);
  eq("perfect fit → no gaps", r.gaps, []);
  eq("perfect fit → meets experience", r.meetsExperience, true);
  eq("reasons capped at three", r.reasons.length, 3);
  eq("strongest reason first (role)", r.reasons[0], "Matches your nursing role");
}
// Weights: role 30, specialty 25, country 20, type 10, setting 10, experience 15 (=110)
eq("role miss → 80/110 = 73%", scoreJobMatch(job({ nursing_role: "charge-nurse" }), seeker()).percent, 73);
eq("specialty miss → 85/110 = 77%", scoreJobMatch(job({ specialty: "theatre" }), seeker()).percent, 77);
eq("country miss → 90/110 = 82%", scoreJobMatch(job({ country: "india" }), seeker()).percent, 82);
eq("country miss is a gap", scoreJobMatch(job({ country: "india" }), seeker()).gaps, ["Outside your preferred countries"]);
eq("a preferred NEXT role counts as a role match",
  scoreJobMatch(job({ nursing_role: "charge-nurse" }), seeker({ preferred_roles: ["charge-nurse"] })).percent, 100);

// Unstated preferences are not misses (the denominator only counts what the profile expresses)
eq("no type/setting preferences → still 100% on the rest",
  scoreJobMatch(job(), seeker({ preferred_employment_types: [], preferred_work_settings: [] })).percent, 100);
eq("unknown experience is not scored as a miss",
  scoreJobMatch(job({ experience_min_years: 10 }), seeker({ total_years: null })).percent, 100);
eq("unknown experience → meetsExperience stays true",
  scoreJobMatch(job({ experience_min_years: 10 }), seeker({ total_years: null })).meetsExperience, true);

// Remote: a country "miss" is not a miss
{
  const r = scoreJobMatch(job({ is_remote: true, country: "india" }), seeker());
  eq("remote job abroad → no country penalty", r.percent, 100);
  eq("remote job abroad → no country gap", r.gaps.includes("Outside your preferred countries"), false);
}

// Experience is a threshold, not a distance
eq("exactly the minimum meets it", scoreJobMatch(job({ experience_min_years: 5 }), seeker({ total_years: 5 })).meetsExperience, true);
eq("far above the minimum scores the same as just above",
  scoreJobMatch(job({ experience_min_years: 2 }), seeker({ total_years: 30 })).percent,
  scoreJobMatch(job({ experience_min_years: 2 }), seeker({ total_years: 3 })).percent);
{
  const r = scoreJobMatch(job({ experience_min_years: 8 }), seeker({ total_years: 3 }));
  eq("below minimum → meetsExperience false", r.meetsExperience, false);
  eq("below minimum → gap names the bar", r.gaps, ["Asks for 8+ years experience"]);
  eq("below minimum → 95/110 = 86%", r.percent, 86);
}
eq("min 0 years → not scored", scoreJobMatch(job({ experience_min_years: 0 }), seeker({ total_years: 0 })).percent, 100);

// Licensing: a warning, never a score
{
  const r = scoreJobMatch(job({ license_required: true, country: "united-kingdom" }), seeker({ licence_country: "india" }));
  eq("foreign licence on a licensed role → gap", r.gaps.includes("Requires a local licence you have not listed"), true);
  eq("licence gap does not change the score", r.percent, 100);
}
eq("sponsorship removes the licence gap",
  scoreJobMatch(job({ license_required: true, visa_sponsorship: true }), seeker({ licence_country: "india" })).gaps.includes("Requires a local licence you have not listed"), false);
eq("same-country licence → no gap",
  scoreJobMatch(job({ license_required: true }), seeker()).gaps, []);

// Visa sponsorship must survive the 3-reason cap (it is unshifted, not pushed)
{
  const r = scoreJobMatch(job({ visa_sponsorship: true }), seeker());
  eq("sponsorship reason is first", r.reasons[0], "Offers visa sponsorship");
  eq("still three reasons max", r.reasons.length, 3);
}
eq("sponsorship in a country they don't want → not a reason",
  scoreJobMatch(job({ visa_sponsorship: true, country: "india" }), seeker()).reasons.includes("Offers visa sponsorship"), false);

// Too little to score honestly → null, not a misleading number
eq("empty profile → null percent", scoreJobMatch(job(), EMPTY).percent, null);
eq("empty profile → no reasons", scoreJobMatch(job(), EMPTY).reasons, []);
eq("only a type preference (thin) → null",
  scoreJobMatch(job(), { ...EMPTY, preferred_employment_types: ["full_time"] }).percent, null);
eq("role only → scorable", scoreJobMatch(job(), { ...EMPTY, nursing_role: "staff-nurse" }).percent, 100);
eq("job with no comparable fields → null",
  scoreJobMatch({ nursing_role: null, specialty: null, country: null, employment_type: "full_time", work_setting: null, experience_min_years: null, license_required: false, is_remote: false },
    { ...EMPTY, nursing_role: "staff-nurse" }).percent, null);
eq("percent is always 0–100", [scoreJobMatch(job({ nursing_role: "x", specialty: "y", country: "z", employment_type: "locum", work_setting: "home", experience_min_years: 40 }), seeker()).percent], [0]);

console.log("\n=== matchTone ===");
eq("threshold is 60", RECOMMEND_THRESHOLD, 60);
eq("100 → strong", matchTone(100), "strong");
eq("80 → strong", matchTone(80), "strong");
eq("79 → good", matchTone(79), "good");
eq("60 → good", matchTone(60), "good");
eq("59 → weak", matchTone(59), "weak");
eq("0 → weak", matchTone(0), "weak");

console.log("\n=== normaliseSeekerVocabulary (labels → values) ===");
const VOCAB: VocabMaps = {
  nursing_role: { "staff-nurse": "Staff Nurse", "charge-nurse": "Charge Nurse" },
  specialty: { "icu-critical-care": "ICU / Critical Care", emergency: "Emergency" },
  country: { "united-kingdom": "United Kingdom", india: "India" },
  employment_type: { full_time: "Full time" },
  work_setting: { hospital: "Hospital", "emergency-dept": "Emergency" },
};
{
  const human: MatchableSeeker = { nursing_role: "Staff Nurse", specialties: ["ICU / Critical Care"], total_years: 5, licence_country: "India", licence_status: "active",
    preferred_countries: ["United Kingdom"], preferred_roles: ["Charge Nurse"], preferred_employment_types: ["Full time"], preferred_work_settings: ["Hospital"] };
  const n = normaliseSeekerVocabulary(human, VOCAB);
  eq("role label → value", n.nursing_role, "staff-nurse");
  eq("specialty label → value", n.specialties, ["icu-critical-care"]);
  eq("country label → value", n.preferred_countries, ["united-kingdom"]);
  eq("licence country label → value", n.licence_country, "india");
  eq("preferred role label → value", n.preferred_roles, ["charge-nurse"]);
  eq("employment type label → value", n.preferred_employment_types, ["full_time"]);
  eq("the employer sees the same fit the nurse sees (was 0% vs 100%)",
    scoreJobMatch(job(), n).percent, scoreJobMatch(job(), seeker({ licence_country: "india" })).percent);
  eq("raw human labels alone score as a miss (why normalising matters)", scoreJobMatch(job(), human).percent === 100, false);
  eq("normalising twice is harmless", normaliseSeekerVocabulary(n, VOCAB), n);
}
eq("case/space-insensitive", normaliseSeekerVocabulary({ ...EMPTY, nursing_role: "  staff NURSE " }, VOCAB).nursing_role, "staff-nurse");
eq("'Emergency' resolves per kind: specialty", normaliseSeekerVocabulary({ ...EMPTY, specialties: ["Emergency"] }, VOCAB).specialties, ["emergency"]);
eq("'Emergency' resolves per kind: work setting", normaliseSeekerVocabulary({ ...EMPTY, preferred_work_settings: ["Emergency"] }, VOCAB).preferred_work_settings, ["emergency-dept"]);
eq("unknown label passes through unchanged", normaliseSeekerVocabulary({ ...EMPTY, specialties: ["Dialysis"] }, VOCAB).specialties, ["Dialysis"]);
eq("null role stays null", normaliseSeekerVocabulary(EMPTY, VOCAB).nursing_role, null);

// ── knockout screening ──────────────────────────────────────────────────────
console.log("\n=== evaluateScreening ===");
const Q = (id: string, question: string, o: Partial<ScreeningQuestion> = {}): ScreeningQuestion =>
  ({ id, question, question_type: "yes_no", is_required: true, knockout_expected: null, knockout_min: null, ...o });
const A = (question_id: string | null, question_text: string, answer: string | null): ScreeningAnswer => ({ question_id, question_text, answer });
const licence = Q("q1", "Do you hold an active RN licence?", { knockout_expected: "yes" });
const years = Q("q2", "Years of ICU experience?", { question_type: "number", knockout_min: 2 });
const free = Q("q3", "Why this role?", { question_type: "short_answer" });

{
  const v = evaluateScreening([licence, years, free], [A("q1", licence.question, "Yes"), A("q2", years.question, "4"), A("q3", free.question, "Growth")]);
  eq("all rules met → meets criteria", v.meetsCriteria, true);
  eq("free-text question is not a rule", v.ruleCount, 2);
  eq("both rules met", v.metCount, 2);
}
eq("no rules at all → criteria tag not shown (ruleCount 0)", evaluateScreening([free], [A("q3", free.question, "x")]).ruleCount, 0);
eq("no rules at all → meetsCriteria false (nothing to meet)", evaluateScreening([free], []).meetsCriteria, false);
for (const yes of ["Yes", " yes ", "Y", "true", "1"]) eq(`"${yes}" counts as yes`, evaluateScreening([licence], [A("q1", licence.question, yes)]).meetsCriteria, true);
for (const no of ["No", "n", "false", "0"]) {
  const v = evaluateScreening([licence], [A("q1", licence.question, no)]);
  eq(`"${no}" is a knockout fail`, [v.meetsCriteria, v.failures.length], [false, 1]);
}
eq("failure message names the answer", evaluateScreening([licence], [A("q1", licence.question, "No")]).failures,
  ['Do you hold an active RN licence? — answered "no"']);
{
  const v = evaluateScreening([licence], [A("q1", licence.question, "maybe")]);
  eq("unreadable yes/no → unanswered, never a pass", [v.meetsCriteria, v.unanswered], [false, [licence.question]]);
}
eq("blank answer → unanswered", evaluateScreening([licence], [A("q1", licence.question, "   ")]).unanswered, [licence.question]);
eq("missing answer → unanswered", evaluateScreening([licence], []).unanswered, [licence.question]);
eq("number at the minimum passes", evaluateScreening([years], [A("q2", years.question, "2")]).meetsCriteria, true);
eq("free-text '3 years' reads as 3 (legacy answers)", evaluateScreening([years], [A("q2", years.question, "3 years")]).meetsCriteria, true);
eq("decimal '1.5' is below 2", evaluateScreening([years], [A("q2", years.question, "1.5")]).failures, ["Years of ICU experience? — answered 1.5, needs 2+"]);
eq("no number in the answer → unanswered", evaluateScreening([years], [A("q2", years.question, "several")]).unanswered, [years.question]);
eq("deleted question: matched by its frozen text", evaluateScreening([licence], [A(null, "  do you hold an ACTIVE rn licence?  ", "yes")]).meetsCriteria, true);
eq("id match wins over text match", evaluateScreening([licence], [A("q1", licence.question, "yes"), A(null, licence.question, "no")]).meetsCriteria, true);
{
  const v = evaluateScreening([licence, years], [A("q1", licence.question, "yes"), A("q2", years.question, "1")]);
  eq("one rule failed → below the bar", [v.meetsCriteria, v.metCount, v.ruleCount], [false, 1, 2]);
}

// ── board helpers ───────────────────────────────────────────────────────────
console.log("\n=== sort / page size / country / employment types ===");
eq("sorts", JOB_SORTS, ["relevance", "recent", "closing"]);
for (const s of JOB_SORTS) eq(`isJobSort("${s}")`, isJobSort(s), true);
for (const s of ["", "newest", "RECENT", null, undefined, 3]) eq(`isJobSort(${JSON.stringify(s)}) rejected`, isJobSort(s), false);
eq("page size", JOBS_PAGE_SIZE, 20);
for (const [input, want] of [["India", "IN"], ["india", "IN"], [" UAE ", "AE"], ["United Kingdom", "GB"], ["uk", "GB"], ["usa", "US"], ["gb", "GB"], ["in", "IN"], [null, "IN"], ["", "IN"], ["Atlantis", "Atlantis"]] as const) {
  eq(`toCountryCode(${JSON.stringify(input)})`, toCountryCode(input), want);
}
eq("every employment type has a schema.org value", Object.keys(EMPLOYMENT_TYPE_LABEL).filter((k) => !EMPLOYMENT_TYPE_SCHEMA[k]), []);
eq("locum → PER_DIEM", EMPLOYMENT_TYPE_SCHEMA.locum, "PER_DIEM");
eq("contract → CONTRACTOR", EMPLOYMENT_TYPE_SCHEMA.contract, "CONTRACTOR");

// ── salary + description ────────────────────────────────────────────────────
console.log("\n=== formatSalary / jobDescriptionHtml ===");
const cj = (o: Partial<CnsJob> = {}): CnsJob => ({
  id: "j", slug: "s", title: "t", description: "Care for ICU patients.", responsibilities: null, qualifications: null, employment_type: "full_time", work_mode: "onsite",
  country: "india", state: null, city: null, street_address: null, postal_code: null, specialty: null, nursing_role: null, work_setting: null, experience_level: null,
  is_remote: false, salary_text: null, internal_ref: null, language_requirements: null, changes_requested_note: null, experience_min_years: null, qualification_required: null,
  license_required: false, salary_min: null, salary_max: null, salary_currency: null, salary_period: null, salary_undisclosed: false, vacancies: 1, application_deadline: null,
  apply_mode: "in_app", external_apply_url: null, visa_sponsorship: false, status: "published", published_at: null, employer_id: "e", created_at: "2026-10-01T00:00:00Z", ...o,
});
eq("range, Indian grouping", formatSalary(cj({ salary_min: 35000, salary_max: 125000, salary_currency: "INR", salary_period: "MONTH" })), "INR 35,000 – 1,25,000 / month");
eq("min only", formatSalary(cj({ salary_min: 40000 })), "INR 40,000 / month");
eq("max only", formatSalary(cj({ salary_max: 50000 })), "INR 50,000 / month");
eq("currency + period", formatSalary(cj({ salary_min: 28, salary_max: 35, salary_currency: "GBP", salary_period: "HOUR" })), "GBP 28 – 35 / hour");
eq("undisclosed → nothing shown", formatSalary(cj({ salary_min: 40000, salary_undisclosed: true })), null);
eq("no figures → nothing shown", formatSalary(cj()), null);
eq("plain description → one paragraph", jobDescriptionHtml(cj()), "<p>Care for ICU patients.</p>");
eq("blank line splits paragraphs, single newline is <br/>", jobDescriptionHtml(cj({ description: "Line one\nline two\n\nPara two" })), "<p>Line one<br/>line two</p><p>Para two</p>");
eq("HTML is escaped (no injection into the page or JSON-LD)", jobDescriptionHtml(cj({ description: '<script>alert("x")</script> & co' })), '<p>&lt;script&gt;alert("x")&lt;/script&gt; &amp; co</p>');
eq("responsibilities + qualifications get headings", jobDescriptionHtml(cj({ responsibilities: "Rounds", qualifications: "BSc" })),
  "<p>Care for ICU patients.</p><h3>Responsibilities</h3><p>Rounds</p><h3>Qualifications</h3><p>BSc</p>");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of fails) console.log(f);
  process.exit(1);
}
