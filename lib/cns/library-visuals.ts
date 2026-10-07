/**
 * Generated cover art for library categories.
 *
 * The imported archive contains NO images — not one featured image, not one
 * inline `<img>` across 9,244 articles. So a category card either shows the
 * same placeholder 48 times on one screen, or it draws something from what it
 * does have: the category's name.
 *
 * Two things come out of the name:
 *   - a MOTIF, which selects a piece of subject-specific artwork (an ECG trace
 *     for cardiac, filled test tubes for lab work, a petri dish for
 *     microbiology). A generic glyph in a coloured box reads as a placeholder;
 *     artwork that matches the subject reads as a designed page.
 *   - a MESH, a layered radial-gradient background.
 *
 * Both are DETERMINISTIC, which matters more than it sounds: the same category
 * must look identical on the index, on its parent's archive and on every
 * reload. Art that reshuffles per render reads as a rendering bug and destroys
 * the only visual cue a reader has for recognising a section they have been in
 * before. Hence a hash of the name rather than an array index, which would
 * shift the moment a category is added or a sort order changes.
 */

export type Motif =
  | "ecg" | "blood" | "lab" | "micro" | "imaging" | "pill" | "syringe"
  | "calc" | "abbrev" | "neuro" | "breath" | "vitals" | "chart" | "doc"
  | "shield" | "people" | "bone" | "infant" | "abstract";

/**
 * First match wins, so this runs specific → general. "Blood Tests" has to
 * reach the blood rule before the generic /test/ rule, and "ECG Basics" must
 * not be caught by /basic/ and turned into a document.
 */
const MOTIF_RULES: Array<[RegExp, Motif]> = [
  [/ecg|ekg|cardiac|cardio|heart|circulat|rhythm/i, "ecg"],
  // \bct\b, not ct\b — the unbounded form matches "Bile Duct" and hands a
  // radiology scan to a GI section.
  [/imaging|x-?ray|radiolog|ultrasound|scan|mri|\bct\b/i, "imaging"],
  [/microbiolog|culture|infect|bacteri|virus|antibiot|pathogen/i, "micro"],
  [/blood|haemat|hemat|transfus|coagul|serum|plasma/i, "blood"],
  [/urine|stool|renal|kidney|specimen|electrolyte|fluid/i, "lab"],
  [/respirat|pulmonar|lung|oxygen|airway|ventilat|breath/i, "breath"],
  // \bmental\b, not mental — "FundaMENTALs" matched the unbounded form and
  // came back as a neuroscience section.
  [/neuro|brain|cognit|\bmental\b|psych|nerve/i, "neuro"],
  [/orthop|bone|muscul|skelet|fractur|joint/i, "bone"],
  [/matern|obstetric|paediatric|pediatric|neonat|child|infant|birth/i, "infant"],
  [/vital|temperature|fever|monitor|pressure|saturation/i, "vitals"],
  [/pharmac|medication|drug|dose form|prescrib/i, "pill"],
  [/injection|infusion|intravenous|\biv\b|syringe|vaccin|immunis/i, "syringe"],
  // Shield sits above chart so "Critical Values" reads as a warning rather
  // than as a table — the word that matters there is "critical".
  [/safety|critical|alert|risk|precaution|error/i, "shield"],
  // Above the generic lab rule on purpose. "Normal Lab Values" is a table of
  // reference ranges, so it reads better as a chart than as more test tubes —
  // without this, four of the eight cards on the Lab Values archive draw the
  // identical tubes.
  [/normal value|reference range|\brange|\blevels?\b|\bcounts?\b|\bvalues?\b/i, "chart"],
  [/lab|diagnostic|assay|panel|reagent|test/i, "lab"],
  // \bunits?\b — bare "unit" matches "commUNITy".
  [/calculat|dosage|conversion|formula|math|\bunits?\b/i, "calc"],
  [/abbreviation|terminolog|acronym|glossar|prefix|suffix/i, "abbrev"],
  [/case stud|scenario|clinical judgement|care plan/i, "doc"],
  [/disease|condition|disorder|syndrome|patholog/i, "vitals"],
  [/special|department|ward|team/i, "people"],
  // Procedures get the protocol drawing, not the heart: a procedure is a
  // documented sequence of steps, and "Procedures" is one of the ten top-level
  // sections, so its cover is one of the first things anyone sees.
  [/procedure|protocol|skill|technique|nursing care/i, "doc"],
  [/assessment|examination|observation/i, "vitals"],
  [/science|anatomy|physiolog|biochem/i, "neuro"],
  [/document|record|chart|report|note/i, "doc"],
  // No rule for "Fundamentals" / "Introduction" / "Principles" — they fall
  // through to the abstract motif deliberately. They are the sections with no
  // single subject to draw, and forcing them onto the document motif put three
  // identical covers on the ten-card front page.
];

export function categoryMotif(name: string): Motif {
  for (const [pattern, motif] of MOTIF_RULES) if (pattern.test(name)) return motif;
  return "abstract";
}

/**
 * Palettes as raw colour values rather than Tailwind gradient classes.
 *
 * Tailwind's `from-`/`via-`/`to-` utilities can only produce a linear ramp.
 * The covers use layered radial gradients — a mesh — which needs real colour
 * values composed into one background-image, and gives depth a two-stop linear
 * gradient cannot.
 *
 * `deep` is the bottom-left anchor and the one the white title actually sits
 * on. Every value below clears 7:1 against white. The usual way to make text
 * readable over artwork is a translucent black scrim; this app does not put
 * black behind content, so the artwork itself carries the contrast.
 */
type Palette = { deep: string; mid: string; glow: string; spark: string };

const PALETTES: Palette[] = [
  { deep: "#12275e", mid: "#2b4fa8", glow: "#4f83e0", spark: "#8fc0ff" }, // indigo blue
  { deep: "#0b4a3f", mid: "#12786a", glow: "#28ab90", spark: "#7fe3c4" }, // emerald
  { deep: "#3a1465", mid: "#5f2a9e", glow: "#8b56d6", spark: "#c9a6ff" }, // violet
  { deep: "#6b3410", mid: "#a8571b", glow: "#d9832f", spark: "#ffc48a" }, // amber
  { deep: "#6a1230", mid: "#a62348", glow: "#d94f74", spark: "#ffa6bd" }, // rose
  { deep: "#0a3f52", mid: "#12697f", glow: "#279bb4", spark: "#7fdcef" }, // cyan
  { deep: "#123a63", mid: "#1f5f96", glow: "#3a8fcc", spark: "#96cdf2" }, // steel
  { deep: "#14493f", mid: "#1d7160", glow: "#2fa384", spark: "#8ee0c2" }, // teal
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function categoryPalette(seed: string): Palette {
  return PALETTES[hash(seed) % PALETTES.length];
}

/**
 * The cover background: three stacked radial gradients over a linear base.
 *
 * Radial gradients rather than blurred elements on purpose. The modern look
 * here is a soft colour mesh, and the obvious way to get one is a few
 * absolutely-positioned blobs with `filter: blur()`. That filter is expensive,
 * and the Procedures archive renders 48 covers on one screen — 150 blurred
 * layers would drop frames on a phone. Gradients are painted once by the
 * compositor with no filter pass at all.
 *
 * Angles vary per category so neighbouring cards do not look stamped.
 */
export function categoryMesh(seed: string): string {
  const p = categoryPalette(seed);
  const h = hash(seed);
  const x1 = 12 + (h % 24);
  // >>> not >>: the hash is unsigned, and a signed shift went negative for
  // about half of all seeds, pushing covers outside their designed ranges.
  const y1 = 8 + ((h >>> 3) % 18);
  const x2 = 68 + ((h >>> 6) % 26);
  const angle = 145 + ((h >>> 9) % 40);

  return [
    `radial-gradient(90% 70% at ${x2}% 4%, ${p.spark}55 0%, transparent 58%)`,
    `radial-gradient(85% 75% at ${x1}% ${y1}%, ${p.glow}88 0%, transparent 62%)`,
    `radial-gradient(120% 110% at 50% 120%, ${p.deep} 20%, transparent 70%)`,
    `linear-gradient(${angle}deg, ${p.mid} 0%, ${p.deep} 100%)`,
  ].join(", ");
}

/**
 * Staggered start for the idle drift, in seconds.
 *
 * Without it every card on the page breathes in perfect unison, which looks
 * mechanical and makes the collective movement far more noticeable than any
 * single card's. Derived from the name, so it is stable across reloads.
 */
export function categoryDelay(seed: string): string {
  return `-${(hash(seed) % 110) / 10}s`;
}
