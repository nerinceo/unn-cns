/**
 * Question Bank copy, lifted verbatim from the legacy Nursing Bank
 * (unnhub.org/nursingbank) so the CNS bank reads identically to a student who
 * used the old site.
 *
 * Every string here is EXACT and must stay that way — including the ` · `
 * middot separators, the `→` and `←` glyphs baked into label text, the curly
 * apostrophes in "Cebu Doctors’" and "King’s College London", and the quirks:
 *
 *   - `{n} marks` never singularises, so a 1-mark question reads "1 marks".
 *   - `{n} questions` never singularises either.
 *   - The four answer fields carry colons on the list page (`Answer:`) and no
 *     colons on the detail page (`Answer`). Two forms, deliberately kept.
 *   - The Indian banks are named by acronym while the other sixteen are
 *     spelled out.
 *
 * These read like bugs and are not to be "fixed" here. The wording is settled;
 * this module exists so it is typed once instead of retyped into five pages the
 * way the old static site did it.
 */

/** Product identity. Old footer pattern: `Nursing Bank by UNN Hub · {context}`. */
export const BANK_IDENTITY = {
  name: "Nursing Bank",
  tagline: "The Central Bank of Nursing Questions and Resources",
  attribution: "Nursing Bank by Nerusalem",
} as const;

/** `Nursing Bank by UNN Hub · RGUHS B.Sc Nursing` */
export function bankFooter(context: string): string {
  return `${BANK_IDENTITY.attribution} · ${context}`;
}

/** Root directory page — the university level. */
export const DIRECTORY_COPY = {
  heading: "Global University Question Banks",
  subtitle:
    "Browse nursing university question banks from India, Philippines, Africa, USA, Australia, Canada, and the UK. Banks marked Coming Soon will open through our partner colleges.",
  cardCta: "View Question Bank →",
  comingSoonCta: "Partner colleges",
} as const;

export type BankEntry = {
  key: string;
  name: string;
  location: string;
  description: string;
};

/**
 * The 20 banks in the old site's display order, grouped by country.
 *
 * Only `rguhs` has content behind it. The other 19 were live cards that all
 * unlocked to the RGUHS pages — a bug, not a feature. Here they are data, so
 * the page can link the one that exists and show the access panel for the rest.
 */
export const BANK_DIRECTORY: { country: string; banks: BankEntry[] }[] = [
  {
    country: "India",
    banks: [
      {
        key: "rguhs",
        name: "RGUHS Question Bank",
        location: "India / Karnataka",
        description: "Rajiv Gandhi University of Health Sciences nursing question bank.",
      },
      {
        key: "kuhs",
        name: "KUHS Question Bank",
        location: "India / Kerala",
        description: "Kerala University of Health Sciences nursing question bank.",
      },
      {
        key: "tnmgr",
        name: "Tamil Nadu MGR Question Bank",
        location: "India / Tamil Nadu",
        description: "Tamil Nadu Dr. M.G.R. Medical University nursing question bank.",
      },
      {
        key: "muhs",
        name: "MUHS Question Bank",
        location: "India / Maharashtra",
        description: "Maharashtra University of Health Sciences nursing question bank.",
      },
    ],
  },
  {
    country: "Philippines",
    banks: [
      {
        key: "up-manila",
        name: "UP Manila Question Bank",
        location: "Philippines",
        description: "University of the Philippines Manila nursing question bank.",
      },
      {
        key: "ust",
        name: "University of Santo Tomas Question Bank",
        location: "Philippines",
        description: "University of Santo Tomas nursing question bank.",
      },
      {
        key: "cebu-doctors",
        name: "Cebu Doctors’ University Question Bank",
        location: "Philippines",
        description: "Cebu Doctors’ University nursing question bank.",
      },
    ],
  },
  {
    country: "Africa",
    banks: [
      {
        key: "ghana",
        name: "University of Ghana Question Bank",
        location: "Africa / Ghana",
        description: "University of Ghana nursing and midwifery question bank.",
      },
      {
        key: "nairobi",
        name: "University of Nairobi Question Bank",
        location: "Africa / Kenya",
        description: "University of Nairobi nursing question bank.",
      },
      {
        key: "cape-town",
        name: "University of Cape Town Question Bank",
        location: "Africa / South Africa",
        description: "University of Cape Town nursing question bank.",
      },
    ],
  },
  {
    country: "USA",
    banks: [
      {
        key: "upenn",
        name: "University of Pennsylvania Question Bank",
        location: "USA",
        description: "University of Pennsylvania nursing question bank.",
      },
      {
        key: "johns-hopkins",
        name: "Johns Hopkins University Question Bank",
        location: "USA",
        description: "Johns Hopkins University nursing question bank.",
      },
      {
        key: "duke",
        name: "Duke University Question Bank",
        location: "USA",
        description: "Duke University nursing question bank.",
      },
    ],
  },
  {
    country: "Australia",
    banks: [
      {
        key: "sydney",
        name: "University of Sydney Question Bank",
        location: "Australia",
        description: "University of Sydney nursing question bank.",
      },
      {
        key: "monash",
        name: "Monash University Question Bank",
        location: "Australia",
        description: "Monash University nursing question bank.",
      },
      {
        key: "melbourne",
        name: "University of Melbourne Question Bank",
        location: "Australia",
        description: "University of Melbourne nursing question bank.",
      },
    ],
  },
  {
    country: "Canada",
    banks: [
      {
        key: "toronto",
        name: "University of Toronto Question Bank",
        location: "Canada",
        description: "University of Toronto nursing question bank.",
      },
      {
        key: "alberta",
        name: "University of Alberta Question Bank",
        location: "Canada",
        description: "University of Alberta nursing question bank.",
      },
    ],
  },
  {
    country: "UK",
    banks: [
      {
        key: "kcl",
        name: "King’s College London Question Bank",
        location: "UK",
        description: "King’s College London nursing question bank.",
      },
      {
        key: "manchester",
        name: "University of Manchester Question Bank",
        location: "UK",
        description: "University of Manchester nursing question bank.",
      },
    ],
  },
];

/**
 * The not-yet-open state for every directory bank with no content (all but
 * RGUHS today — 19 of 20).
 *
 * These banks will be partner-college access only, but no partner gate exists
 * yet — the old one was decorative (codes in client JS, nothing checked behind
 * them). "Access Restricted" therefore promised a door that does not exist, so
 * the state is worded as what it actually is: coming soon. When a real gate is
 * built it belongs on the server, and this copy changes with it.
 */
export const ACCESS_COPY = {
  badge: "Coming Soon",
  heading: "Coming Soon",
  body: "This university question bank is being prepared with our partner colleges and will open here for their students. Check back soon, or ask your college administration about partnering with Nerusalem.",
  codeLabel: "Already have access code?",
  codePlaceholder: "Enter access code",
  unlockAction: "Unlock",
  unlockSuccess: "Access code accepted. Opening question bank...",
  unlockError: "Invalid access code. Please contact your college administration.",
  backToDirectory: "← Back to Nursing Bank",
} as const;

/** Course level. Only B.Sc Nursing has content; the rest are badged Coming Soon. */
export const COURSE_PICKER_COPY = {
  heroSubtitle:
    "Rajiv Gandhi University of Health Sciences nursing question banks, answers, and exam preparation resources.",
  heading: "Select Nursing Course",
  subtitle:
    "Choose a nursing course to view university exam questions, answers, subjects, years, units, and topic-wise practice resources.",
  back: "← Back to Nursing Bank",
  availableBadge: "Open",
  unavailableBadge: "Coming Soon",
} as const;

export const COURSES = [
  {
    key: "bsc-nursing",
    name: "B.Sc Nursing",
    description:
      "Year-wise B.Sc Nursing university exam questions and answers organized for structured student practice.",
    available: true,
  },
  {
    key: "gnm",
    name: "GNM",
    description: "General Nursing and Midwifery exam questions, answers, and study resources.",
    available: false,
  },
  {
    key: "pb-bsc-nursing",
    name: "P.B. B.Sc Nursing",
    description: "Post Basic B.Sc Nursing question bank and academic preparation resources.",
    available: false,
  },
  {
    key: "msc-nursing",
    name: "M.Sc Nursing",
    description:
      "M.Sc Nursing exam resources, specialty-wise questions, and postgraduate academic support.",
    available: false,
  },
] as const;

/** Semester level. */
export const SEMESTER_PICKER_COPY = {
  heroSubtitle:
    "Semester-wise B.Sc Nursing university exam questions and answers organized for student practice and exam preparation.",
  heading: "Select Semester",
  subtitle:
    "Choose a B.Sc Nursing semester to view questions, answers, subjects, units, topics, and exam practice resources.",
  back: "← Back to RGUHS",
  badge: "Open",
  countLoading: "Loading questions...",
  countUnavailable: "Questions unavailable",
} as const;

/** `1097 questions`. Never singularised — matches the source exactly. */
export function questionCountLabel(n: number): string {
  return `${n} questions`;
}

export const SEMESTERS = [
  {
    number: 1,
    name: "Semester 1",
    description: "Foundational B.Sc Nursing subjects and first semester exam practice questions.",
  },
  {
    number: 2,
    name: "Semester 2",
    description: "Second semester B.Sc Nursing questions, answers, and subject-wise practice.",
  },
  {
    number: 3,
    name: "Semester 3",
    description: "Third semester B.Sc Nursing university exam questions and study practice.",
  },
  {
    number: 4,
    name: "Semester 4",
    description:
      "Fourth semester B.Sc Nursing questions and answers organized for exam preparation.",
  },
  {
    number: 5,
    name: "Semester 5",
    description: "Fifth semester B.Sc Nursing subject-wise exam questions and practice resources.",
  },
  {
    number: 6,
    name: "Semester 6",
    description: "Sixth semester B.Sc Nursing university questions, answers, and revision support.",
  },
  {
    number: 7,
    name: "Semester 7",
    description: "Seventh semester B.Sc Nursing exam practice questions and academic preparation.",
  },
  {
    number: 8,
    name: "Semester 8",
    description:
      "Eighth semester B.Sc Nursing final semester questions, answers, and exam practice.",
  },
] as const;

/** Question list page — filters, states, card actions. */
export const QUESTION_LIST_COPY = {
  subtitle: "University exam questions, answers, rationales, and exam tips for nursing students.",
  back: "← Back to Semesters",
  filterHeading: "Filter Questions",
  allSubjects: "All Subjects",
  allTypes: "All Question Types",
  searchPlaceholder: "Search questions...",
  loadMore: "Load More",
  empty: "No questions found for this selection.",
  loading: "Loading questions...",
  exhausted: "No more questions.",
  loadError: "Error loading questions.",
  showAnswer: "Show Answer",
  openFull: "Open Full Question",
} as const;

/** `RGUHS B.Sc Nursing - Semester 1` — a hyphen, not an en-dash. */
export function questionListTitle(
  university: string,
  course: string,
  semester: number | string
): string {
  return `${university} ${course} - Semester ${semester}`;
}

/** `Showing 25 of 1097 questions` */
export function showingLabel(shown: number, total: number): string {
  return `Showing ${shown} of ${total} questions`;
}

/** `Questions: 1097` */
export function countPillLabel(total: number | "loading" | "error"): string {
  return `Questions: ${total}`;
}

/** `Applied Anatomy and Physiology (411)` — subject dropdown and chip label. */
export function subjectOptionLabel(subject: string, count: number): string {
  return `${subject} (${count})`;
}

/**
 * Answer-field labels. Two forms, exactly as the source had them: inline with
 * colons on the list, headings without colons on the detail page.
 */
export const ANSWER_LABELS_INLINE = {
  correctOption: "Correct Option:",
  answer: "Answer:",
  rationale: "Rationale:",
  examTip: "Exam Tip:",
} as const;

export const ANSWER_LABELS_HEADING = {
  correctOption: "Correct Option",
  answer: "Answer",
  rationale: "Rationale",
  examTip: "Exam Tip",
} as const;

/** Detail page. */
export const QUESTION_DETAIL_COPY = {
  heading: "Nursing Bank Question",
  subtitle: "Full question, answer, rationale, and exam tip.",
  back: "← Back to Questions",
  loading: "Loading question...",
  notFound: "Question not found.",
  missingId: "No question ID found.",
} as const;

/**
 * `5 marks`. Never singularised in the source — 1-mark questions read
 * "1 marks". Preserved deliberately.
 */
export function marksLabel(marks: number): string {
  return `${marks} marks`;
}

/** ` · `-separated meta chain with empty segments dropped. */
export function metaChain(parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
}

/**
 * Drop a trailing `Rationale: …` from a model answer when the question's own
 * `rationale` column already says exactly the same thing.
 *
 * WHY: the RGUHS import packed a composite blob into model_answer —
 *
 *     Correct Answer: A. Encoding, Storage, Retrieval
 *     Rationale: The information processing model describes memory as …
 *
 * — while ALSO filling the discrete `rationale` column. Both are rendered as
 * their own section, so the reader sees the identical sentence twice, once
 * under "Answer:" and again under "Rationale:".
 *
 * Measured over all 8,929 questions:
 *     309  tail is an exact duplicate of the column  -> stripped here
 *     910  tail DIFFERS from the column              -> kept, both are content
 *      34  column is empty, tail is the only copy    -> kept, or the rationale
 *                                                       would vanish entirely
 *
 * So this only ever removes a repeat that differs at most in letter case and whitespace. Deliberately a render-time
 * normaliser rather than a data migration: the source rows stay intact, and a
 * re-import cannot reintroduce the duplicate display.
 *
 * The `Correct Answer: X` line is left alone on purpose — the "Correct Option"
 * badge shows only the letter, so that line still carries the option's text.
 */
export function dedupeModelAnswer(
  modelAnswer: string | null | undefined,
  rationale: string | null | undefined
): string | null {
  if (!modelAnswer) return modelAnswer ?? null;
  if (!rationale) return modelAnswer;
  const m = modelAnswer.match(/^([\s\S]*?)\n\s*Rationale:\s*([\s\S]*)$/i);
  if (!m) return modelAnswer;
  const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (squash(m[2]) !== squash(rationale)) return modelAnswer;
  const head = m[1].trim();
  return head.length > 0 ? head : modelAnswer;
}

/** Shown on pages that display question content, never on navigation pages. */
export const DISCLAIMER = {
  label: "Educational Disclaimer:",
  body: "Nursing Bank content is provided for educational and exam preparation purposes only. It should not be used as a substitute for official university instructions, clinical judgment, institutional policy, or professional healthcare guidance.",
} as const;
