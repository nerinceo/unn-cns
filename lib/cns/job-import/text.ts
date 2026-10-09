import "server-only";
import { createHash } from "crypto";

/**
 * Text helpers for imported listings.
 *
 * Imported descriptions are stored as PLAIN text. jobDescriptionHtml() escapes
 * every description before rendering, so upstream HTML would show as literal
 * tags; converting here keeps paragraphs and list items readable instead.
 */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Upstream HTML (or entity-encoded HTML) to paragraphs of plain text. */
export function htmlToText(raw: string | null | undefined, max = 8000): string {
  if (!raw) return "";
  // Greenhouse ships its content entity-ENCODED ("&lt;p&gt;"): decode once
  // first so the tags below are seen as tags.
  let s = /&lt;\/?[a-z]/i.test(raw) ? decodeEntities(raw) : raw;
  s = s
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|section|tr)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  s = decodeEntities(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")} …` : s;
}

/** One line, no markup — titles, company names, places. */
export function oneLine(raw: string | null | undefined, max = 200): string {
  return htmlToText(raw ?? "", max * 2).replace(/\s+/g, " ").trim().slice(0, max);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Company name → stub key. "AIIMS, Delhi" and "Aiims Delhi" collide on purpose. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pvt|private|ltd|limited|llp|inc|plc|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The same role listed by two aggregators is one role. */
export function dedupeKey(title: string, company: string, city: string | null): string {
  const n = (x: string | null) => (x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return createHash("sha1").update(`${n(title)}|${normaliseName(company)}|${n(city)}`).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Healthcare filter                                                          */
/* -------------------------------------------------------------------------- */

// Matched against the TITLE. A description mentions "patients" or "hospital"
// in plenty of roles that are not clinical (sales, IT, billing), so it is not
// trusted on its own.
const HEALTHCARE = new RegExp(
  [
    "nurs(e|es|ing)\\b", "\\bR\\.?N\\.?\\b", "\\bL\\.?P\\.?N\\b", "\\bLVN\\b", "\\bGNM\\b", "\\bANM\\b",
    "midwi", "matron", "ward sister", "health ?visitor", "\\bICU\\b", "\\bNICU\\b", "\\bPICU\\b",
    "\\bCCU\\b", "theatre", "operating room", "\\bOT (staff|technician|assistant)",
    "care ?(assistant|worker|giver)", "caregiver", "healthcare assistant", "\\bHCA\\b", "patient care",
    "clinical", "clinician", "physician", "doctor", "medical officer", "\\bMBBS\\b", "surgeon",
    "pharmac", "physiotherap", "occupational therap", "radiograph", "sonograph", "dialysis",
    "phlebotom", "paramedic", "\\bEMT\\b", "anaesthe", "anesthe", "respiratory therap",
    "lab(oratory)? technician", "medical technolog", "dental", "dentist", "optometr",
    "dietitian", "nutritionist", "infection control", "nurse educator", "home health",
  ].join("|"),
  "i"
);

// Roles that use a healthcare word without being healthcare work.
const NOT_HEALTHCARE = new RegExp(
  [
    "nursery", "veterinar", "\\bvet\\b", "sales", "business development", "marketing",
    "software", "developer", "engineer(?!ing assistant)", "accountant", "recruiter",
    "data (analyst|scientist)", "clinical (data|programmer|research associate)", "driver",
  ].join("|"),
  "i"
);

export function isHealthcareTitle(title: string): boolean {
  return HEALTHCARE.test(title) && !NOT_HEALTHCARE.test(title);
}

/* -------------------------------------------------------------------------- */
/* Vocabulary mapping                                                         */
/* -------------------------------------------------------------------------- */

/** ISO alpha-2 → cns_job_categories country value. Others land in "other". */
const COUNTRY_BY_ISO: Record<string, string> = {
  IN: "india", CA: "canada", US: "united-states", AU: "australia", NZ: "new-zealand",
  GB: "united-kingdom", UK: "united-kingdom", IE: "ireland", AE: "united-arab-emirates",
  SA: "saudi-arabia", OM: "oman", QA: "qatar", KW: "kuwait", BH: "bahrain", DE: "germany",
  SG: "singapore", CH: "switzerland",
};

/** For the admin source form. */
export const COUNTRY_OPTIONS: { iso: string; label: string }[] = [
  { iso: "IN", label: "India" }, { iso: "AE", label: "United Arab Emirates" },
  { iso: "SA", label: "Saudi Arabia" }, { iso: "QA", label: "Qatar" }, { iso: "OM", label: "Oman" },
  { iso: "KW", label: "Kuwait" }, { iso: "BH", label: "Bahrain" }, { iso: "GB", label: "United Kingdom" },
  { iso: "IE", label: "Ireland" }, { iso: "US", label: "United States" }, { iso: "CA", label: "Canada" },
  { iso: "AU", label: "Australia" }, { iso: "NZ", label: "New Zealand" }, { iso: "DE", label: "Germany" },
  { iso: "SG", label: "Singapore" }, { iso: "CH", label: "Switzerland" },
];

export function countryValue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return COUNTRY_BY_ISO[iso.toUpperCase()] ?? "other";
}

/** Upstream contract words → cns employment_type. Unknown → full-time. */
export function employmentType(...hints: (string | null | undefined)[]): string {
  const h = hints.filter(Boolean).join(" ").toLowerCase();
  if (/part[\s_-]?time/.test(h)) return "part-time";
  if (/intern/.test(h)) return "internship";
  if (/locum|temp|temporary|fixed[\s_-]?term/.test(h)) return "temporary";
  if (/contract/.test(h)) return "contract";
  if (/casual|per[\s_-]?diem|bank/.test(h)) return "casual";
  if (/travel/.test(h)) return "travel-assignment";
  if (/permanent/.test(h)) return "permanent";
  return "full-time";
}
