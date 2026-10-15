/**
 * Question Bank Pro — the nerusalem.in pages, served as a pixel copy.
 *
 * The pages are the source site's own HTML, byte-exact in CONTENT
 * qbank2.site_pages. Serving them changes only what has to change:
 *
 *   1. Data layer. The source pages call its Supabase project straight from the
 *      browser with an anon key that can read everything (answer keys
 *      included). Both literals are swapped for this app's own endpoint, which
 *      checks the purchase first; nothing of the source project reaches a
 *      browser (asserted, not assumed).
 *   2. Mock exams (Naveen, 2026-10-14): "submit and self score — after they
 *      submit we will reveal the answers". The source only unlocks the key at
 *      time-up and keeps scores in localStorage. A Submit button (the page's
 *      own button classes) ends the exam through the page's own time-up path;
 *      the key is fetched only after the server records the submission, and
 *      self scores save to the account. Four sentences that promised "locked
 *      until the timer reaches zero" are reworded to say so.
 *   3. Free samples for a semester the member hasn't bought: pages whose
 *      content is built into the HTML are cut down before sending, and a
 *      banner offers the purchase. Data pages are capped by the endpoint.
 *
 * Every edit is anchored to an exact string that must occur exactly once; a
 * source page that changed shape throws rather than half-patching.
 *
 * Pure functions, no imports: unit-testable without Next.
 */

export const PRO_BASE = "/question-bank/rguhs-pro";
export const PRO_DATA = `${PRO_BASE}/_data`;

const SOURCE_REF = "pfbqgmicdmthhqorlwib";
const SOURCE_URL_LITERAL = `"https://${SOURCE_REF}.supabase.co"`;
const JWT_LITERAL = /"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"/g;

/** Free sample sizes for pages whose content ships inside the HTML. */
export const SAMPLE = { mnemonics: 12, notes: 12, sos: 12, taplets: 10 } as const;

export type PageKind =
  | { kind: "shell" }                       // navigation only: no paid content in the HTML
  | { kind: "data"; page: "model" | "previous" | "important" | "mock" } // content comes from the endpoint
  | { kind: "mnemonics"; semester: number }
  | { kind: "notes"; semester: number }
  | { kind: "sos"; semester: number | null } // null = the general deck
  | { kind: "taplets" };                    // semester comes from qbank2.taplet_papers

const DATA_PAGES: Record<string, "model" | "previous" | "important" | "mock"> = {
  "model-questions.html": "model",
  "previous-questions.html": "previous",
  "most-important.html": "important",
  "mock-exams.html": "mock",
};

/** A page path as stored in qbank2.site_pages: lowercase segments, .html. */
export function isPagePath(path: string): boolean {
  return /^[a-z0-9-]+(\/[a-z0-9-]+)*\.html$/.test(path);
}

export function classifyPage(path: string): PageKind {
  if (DATA_PAGES[path]) return { kind: "data", page: DATA_PAGES[path] };
  const sem = path.match(/semester-([1-8])\.html$/);
  const n = sem ? Number(sem[1]) : null;
  if (path.startsWith("exam-hacks/mnemonics/") && n) return { kind: "mnemonics", semester: n };
  if (path.startsWith("exam-hacks/revision-notes/") && n) return { kind: "notes", semester: n };
  if (path === "exam-hacks/exam-sos/general.html") return { kind: "sos", semester: null };
  if (path.startsWith("exam-hacks/exam-sos/") && n) return { kind: "sos", semester: n };
  if (path.startsWith("practice-taplets/papers/")) return { kind: "taplets" };
  return { kind: "shell" };
}

class PatchError extends Error {}

/** Replace `find` (which must occur exactly once) with `replace`. */
function once(html: string, find: string, replace: string, page: string): string {
  const first = html.indexOf(find);
  if (first < 0 || html.indexOf(find, first + 1) >= 0) {
    throw new PatchError(`${page}: anchor ${first < 0 ? "missing" : "not unique"}: ${find.slice(0, 80)}`);
  }
  return html.slice(0, first) + replace + html.slice(first + find.length);
}

/** 1. Point the page's Supabase client at this app's endpoint. */
function rewriteDataLayer(html: string, page: string): string {
  let out = html.split(SOURCE_URL_LITERAL).join(`(location.origin+"${PRO_DATA}")`);
  // supabase-js refuses an empty key; the endpoint authenticates by session cookie.
  out = out.replace(JWT_LITERAL, '"cns"');
  if (out.includes(SOURCE_REF) || /eyJhbGciOi/.test(out)) {
    throw new PatchError(`${page}: source project reference survived the rewrite`);
  }
  return out;
}

/** 2. Submit → reveal → self score, on the page's own machinery. */
function patchMockExams(html: string): string {
  const p = "mock-exams.html";
  const edits: [string, string][] = [
    // Wording that would otherwise contradict the flow.
    [
      "The exam starts only when you press Start, and the answer key remains locked until the timer reaches zero.",
      "The exam starts only when you press Start, and the answer key remains locked until you submit or the timer reaches zero.",
    ],
    [
      "After the exam starts, the answer key remains locked until the timer reaches zero.",
      "After the exam starts, the answer key unlocks when you press <b>Submit Exam</b> or the timer reaches zero.",
    ],
    ["Answer key remains locked until time is complete.", "Answer key unlocks when you submit or time is complete."],
    [
      "The answer key will unlock automatically when the timer reaches zero.",
      "The answer key unlocks when you submit, or automatically when the timer reaches zero.",
    ],
    [
      "The answer key unlocks only after the full exam time is complete.",
      "The answer key unlocks when you submit the exam or the full exam time is complete.",
    ],
    [
      "Exam started. The answer key will unlock when the timer reaches zero.",
      "Exam started. Press Submit Exam when you finish, or the answer key unlocks when the timer reaches zero.",
    ],
    [
      "Answer key is locked until the exam timer reaches zero.",
      "Answer key is locked until you submit the exam or the timer reaches zero.",
    ],
    [
      "Model answers and key points remain locked until the timer reaches zero.",
      "Model answers and key points remain locked until you submit the Viva or the timer reaches zero.",
    ],
    [
      "The model answer remains locked until the Viva timer reaches zero.",
      "The model answer remains locked until you submit the Viva or the timer reaches zero.",
    ],
    [
      "Viva started. The answer key will unlock when the timer reaches zero.",
      "Viva started. Press Submit Viva when you finish, or the answer key unlocks when the timer reaches zero.",
    ],
    [
      "Viva answer key is locked until the timer reaches zero.",
      "Viva answer key is locked until you submit the Viva or the timer reaches zero.",
    ],
    // Time-up messages, when the end came from Submit rather than the clock.
    // A single-quoted string in the source, so concatenation rather than ${}.
    [
      "<span>Time is complete — the answer key remains available for review.</span>';",
      "<span>'+(state.qb2Submitted?\"Exam submitted — the answer key is now available.\":\"Time is complete — the answer key remains available for review.\")+'</span>';",
    ],
    [
      'toast("Time is complete. The answer key remains available.",5000);',
      'toast(state.qb2Submitted?"Exam submitted. The answer key is now available.":"Time is complete. The answer key remains available.",5000);',
    ],
    [
      'toast("Viva time is complete. The answer key is now available.",5000);',
      'toast(state.qb2Submitted?"Viva submitted. The answer key is now available.":"Viva time is complete. The answer key is now available.",5000);',
    ],
    // The Submit buttons, shown only while an exam is running.
    [
      '<button id="writtenAnswerButton"',
      '${started&&!timeUp?`<button id="qb2SubmitButton" class="primary" type="button" onclick="qb2SubmitExam(\'written\')">Submit Exam</button>`:""}\n        <button id="writtenAnswerButton"',
    ],
    [
      '<div class="viva-key-wrap">',
      '<div class="viva-key-wrap">\n            ${state.vivaTimeUp?"":`<button id="qb2SubmitButton" class="secondary" type="button" onclick="qb2SubmitExam(\'viva\')">Submit Viva</button>`}',
    ],
    // The key is fetched only after the server holds the submission.
    [
      'const {data,error}=await db.rpc("get_mock_exam_answer_key"',
      'await qb2Submit("written",examId);\n  const {data,error}=await db.rpc("get_mock_exam_answer_key"',
    ],
    [
      'const {data,error}=await db.rpc("get_viva_exam_answer_key"',
      'await qb2Submit("viva",examId);\n  const {data,error}=await db.rpc("get_viva_exam_answer_key"',
    ],
    // Self scores go to the account as well as this device.
    ['toast("Self score saved on this device.");', 'qb2SaveScore("written",id,score,total);'],
    ['toast("Viva self score saved on this device.");', 'qb2SaveScore("viva",id,score,total);'],
  ];
  let out = html;
  for (const [find, replace] of edits) out = once(out, find, replace, p);
  return once(out, "</body>", `${MOCK_HELPERS}\n</body>`, p);
}

/**
 * Runs after the page's own script, so it can reach `state`, `stopTimer`,
 * `handleTimeUp` and `toast` — top-level bindings of a classic script are
 * shared with later classic scripts.
 */
const MOCK_HELPERS = `<script>
(function(){
  var RPC = location.origin + ${JSON.stringify(PRO_DATA)} + "/rest/v1/rpc/";
  function call(fn, body){
    return fetch(RPC + fn, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)})
      .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){
        if(!r.ok) throw new Error((j && j.message) || "Request failed");
        return j;
      }); });
  }
  window.qb2Submit = function(kind, id){
    return call("qb2_submit", {p_kind:kind, p_exam_id:Number(id)}).catch(function(e){ console.error(e); });
  };
  window.qb2SubmitExam = function(kind){
    var exam = state.activeExam;
    if(!exam) return;
    var running = kind === "written" ? (state.writtenStarted && !state.writtenTimeUp) : (state.vivaStarted && !state.vivaTimeUp);
    if(!running) return;
    if(!confirm(kind === "written"
      ? "Submit this exam now? The timer stops and the answer key unlocks."
      : "Submit this Viva now? The timer stops and the answer key unlocks.")) return;
    state.qb2Submitted = true;
    window.qb2Submit(kind, kind === "written" ? exam.mock_exam_id : exam.viva_exam_id);
    stopTimer();
    var b = document.getElementById("qb2SubmitButton");
    if(b) b.remove();
    handleTimeUp(kind);
  };
  window.qb2SaveScore = function(kind, id, score, total){
    var label = document.getElementById(kind === "written" ? "writtenSavedScore" : "vivaSavedScore");
    call("qb2_save_score", {p_kind:kind, p_exam_id:Number(id), p_score:Number(score)})
      .then(function(){
        if(label) label.textContent = "Saved: " + score + " / " + total;
        toast(kind === "written" ? "Self score saved." : "Viva self score saved.");
      })
      .catch(function(e){
        console.error(e);
        toast("Saved on this device only — " + e.message);
      });
  };
})();
</script>`;

// ---------------------------------------------------------------------------
// 3. Samples

/** Bracket-matched span of the array literal in `const NAME = [...]`. */
function arraySpan(src: string, name: string): { start: number; end: number } | null {
  const m = src.match(new RegExp("const\\s+" + name + "\\s*=\\s*\\["));
  if (!m || m.index == null) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let quote = "";
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return { start, end: i + 1 };
  }
  return null;
}

function truncateArray(html: string, name: string, keep: number, page: string): string {
  const span = arraySpan(html, name);
  if (!span) throw new PatchError(`${page}: const ${name} not found`);
  const items = JSON.parse(html.slice(span.start, span.end)) as unknown[];
  return html.slice(0, span.start) + JSON.stringify(items.slice(0, keep)) + html.slice(span.end);
}

function truncateMnemonics(html: string, keep: number, page: string): string {
  let n = 0;
  const out = html.replace(/<article\b[^>]*class="[^"]*study-card[^"]*"[^>]*>[\s\S]*?<\/article>/g, (card) =>
    ++n <= keep ? card : "",
  );
  if (n === 0) throw new PatchError(`${page}: no mnemonic cards`);
  return out;
}

function truncateSos(html: string, keep: number, page: string): string {
  const m = html.match(/(<script[^>]*id="sosData"[^>]*>)([\s\S]*?)(<\/script>)/);
  if (!m || m.index == null) throw new PatchError(`${page}: sosData not found`);
  const data = JSON.parse(m[2]) as { cards: unknown[] };
  data.cards = data.cards.slice(0, keep);
  // Same escaping a JSON-in-HTML block needs: never let "</" end the script.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return html.slice(0, m.index) + m[1] + json + m[3] + html.slice(m.index + m[0].length);
}

function sampleBanner(semester: number | null, buyUrl: string | null): string {
  const what = semester ? `Semester ${semester}` : "this bank";
  const link = buyUrl
    ? ` <a href="${buyUrl.replace(/"/g, "&quot;")}" style="color:#fff;font-weight:800;text-decoration:underline">Buy full access</a>`
    : "";
  return `<div role="status" style="position:sticky;top:0;z-index:9999;background:#8B0000;color:#fff;font:600 14px/1.45 Inter,Arial,sans-serif;text-align:center;padding:10px 16px">Free sample of ${what} — you are seeing a preview.${link}</div>`;
}

function insertAfterBodyTag(html: string, insert: string, page: string): string {
  const m = html.match(/<body\b[^>]*>/);
  if (!m || m.index == null) throw new PatchError(`${page}: no <body>`);
  const at = m.index + m[0].length;
  return html.slice(0, at) + insert + html.slice(at);
}

export interface RenderOptions {
  path: string;
  /** null when the page holds no paid content of its own. */
  sample: null | { semester: number | null; buyUrl: string | null };
  /** Show the banner on a navigation/data page for an unbought semester. */
  banner?: { semester: number; buyUrl: string | null } | null;
}

/** The page as this member receives it. */
export function renderProPage(html: string, o: RenderOptions): string {
  const kind = classifyPage(o.path);
  let out = rewriteDataLayer(html, o.path);
  if (kind.kind === "data" && kind.page === "mock") out = patchMockExams(out);

  if (o.sample) {
    if (kind.kind === "mnemonics") out = truncateMnemonics(out, SAMPLE.mnemonics, o.path);
    else if (kind.kind === "notes") out = truncateArray(out, "NOTES", SAMPLE.notes, o.path);
    else if (kind.kind === "sos") out = truncateSos(out, SAMPLE.sos, o.path);
    else if (kind.kind === "taplets") out = truncateArray(out, "tasks", SAMPLE.taplets, o.path);
    out = insertAfterBodyTag(out, sampleBanner(o.sample.semester, o.sample.buyUrl), o.path);
  } else if (o.banner) {
    out = insertAfterBodyTag(out, sampleBanner(o.banner.semester, o.banner.buyUrl), o.path);
  }
  return out;
}
