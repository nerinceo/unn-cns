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

/** The CNS page members see; it frames the copied pages served from PRO_BASE. */
export const PRO_HOME = "/question-bank/rguhs-pro";
/** Where the copied pages themselves are served (inside the CNS shell's frame). */
export const PRO_BASE = "/question-bank/rguhs-pro/view";
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
// 5. The CNS look (Naveen, 2026-10-15: "match the UI as RGUHS — colours,
//    fonts; format and structure stay the same; only cosmetic changes").
//
// Every colour, corner and shadow in a CSS declaration — <style> blocks,
// style="" attributes and the inline styles the page scripts build — is mapped
// onto the CNS tokens (tailwind.config.ts). Layout, spacing and markup are
// untouched. Kept as they are: the per-subject pastel palettes (mnemonic and
// taplet cards are colour-coded by subject, as RGUHS's cards are by year) and
// the brand navy, which is already CNS primary.

const CNS = {
  primary: "#0a2463",
  brand50: "#f2f5fc",
  brand100: "#e3eaf8",
  brand600: "#2f4b9c",
  foreground: "#14161a",
  muted: "#f3f5f8",
  mutedFg: "#475467",
  border: "#d9dee6",
  success: "#047857",
  successSoft: "#ecfdf5",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  shadowCard: "0 1px 2px rgba(16,24,40,.05),0 1px 3px rgba(16,24,40,.04)",
  shadowFloat: "0 4px 8px rgba(16,24,40,.04),0 14px 32px -8px rgba(16,24,40,.12)",
} as const;

function hsl(hex: string): { h: number; s: number; l: number; a: string } | null {
  let x = hex.slice(1);
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  if (x.length !== 6 && x.length !== 8) return null;
  const r = parseInt(x.slice(0, 2), 16) / 255, g = parseInt(x.slice(2, 4), 16) / 255, b = parseInt(x.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l, a: x.length === 8 ? x.slice(6) : "" };
}

type Role = "text" | "fill" | "line";
function roleOf(prop: string): Role {
  if (/^(color|caret-color|fill|stroke|text-decoration-color)$/.test(prop)) return "text";
  if (/border|outline|line|divider|rule/.test(prop)) return "line";
  return "fill"; // background, shadows, and custom properties (the pages use their vars as surfaces)
}

/** One colour, in one role, as CNS would draw it. */
function cnsColour(hex: string, prop: string, keep: ReadonlySet<string>): string {
  const lower = hex.toLowerCase();
  if (keep.has(lower.slice(0, 7))) return hex;
  const c = hsl(lower);
  if (!c) return hex;
  const role = roleOf(prop);
  const withAlpha = (v: string) => (c.a ? v + c.a : v);
  // Brand navy is already CNS primary; maroon becomes it, as on RGUHS.
  if (lower.startsWith("#0a2463")) return hex;
  if (lower.startsWith("#8b0000")) return withAlpha(CNS.primary);
  if (c.l >= 0.97) return hex; // white and near-white surfaces
  const neutral = c.s < 0.14 || (c.h >= 200 && c.h <= 235 && c.s < 0.45 && c.l > 0.55); // greys and blue-greys
  // Light text is text written for a dark surface (the SOS cards): it stays
  // light — a pale tint keeps its colour, a pale grey becomes CNS light slate.
  if (role === "text" && c.l >= 0.62) return neutral ? withAlpha("#d0d5dd") : hex;
  if (neutral || (c.h >= 200 && c.h <= 235 && c.l < 0.3)) {
    if (c.l < 0.3) return withAlpha(role === "text" ? CNS.foreground : CNS.primary); // ink; no black surfaces
    if (c.l < 0.62) return withAlpha(role === "fill" ? CNS.brand600 : CNS.mutedFg);
    if (c.l < 0.9) return withAlpha(role === "text" ? CNS.mutedFg : CNS.border);
    return withAlpha(role === "line" ? CNS.border : c.h >= 200 && c.h <= 235 ? CNS.brand50 : CNS.muted);
  }
  const red = c.h >= 340 || c.h < 12, green = c.h >= 95 && c.h < 175, amber = c.h >= 25 && c.h < 55;
  const soft = c.l > 0.85;
  if (red) return withAlpha(soft ? (role === "line" ? "#fecaca" : CNS.dangerSoft) : CNS.danger);
  if (green) return withAlpha(soft ? (role === "line" ? "#a7f3d0" : CNS.successSoft) : CNS.success);
  if (amber) return withAlpha(soft ? (role === "line" ? "#fde68a" : CNS.warningSoft) : CNS.warning);
  if (c.h >= 200 && c.h < 250) return withAlpha(soft ? CNS.brand100 : c.l < 0.35 ? CNS.primary : CNS.brand600); // blues → brand ramp
  return hex; // other hues (teal, violet …) are subject accents
}

function cnsRadius(v: string): string {
  return v.replace(/(\d+(?:\.\d+)?)px/g, (m, n) => {
    const px = Number(n);
    if (px >= 40) return m; // pills
    if (px >= 14) return "12px";
    if (px >= 9) return "8px";
    return m;
  });
}

function cnsShadow(v: string): string {
  if (/^\s*none\s*$/.test(v) || /(^|,)\s*(inset\s+)?0\s+0\s+0\s/.test(v)) return v; // none, focus rings
  const blurs = Array.from(v.matchAll(/-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+(\d+(?:\.\d+)?)px/g)).map((m) => Number(m[1]));
  return Math.max(0, ...blurs) >= 40 ? CNS.shadowFloat : CNS.shadowCard;
}

/** Colours that encode a subject (inline card palettes) — never recoloured. */
function subjectPalette(html: string): Set<string> {
  const keep = new Set<string>();
  for (const m of Array.from(html.matchAll(/--card-(?:bg|ink|line)\s*:\s*(#[0-9a-fA-F]{6})/g))) keep.add(m[1].toLowerCase());
  for (const m of Array.from(html.matchAll(/\b(?:bg|ink|line|tone|accent|color)\s*:\s*['"](#[0-9a-fA-F]{6})['"]/g))) keep.add(m[1].toLowerCase());
  return keep;
}

/**
 * Contrast guard. Recolouring by value cannot know what each colour ends up
 * sitting on (the SOS cards put the same red on white and on navy). After each
 * render this checks every visible run of text against the background behind
 * it and, below WCAG AA (4.5:1, or 3:1 for large text), sets the nearest CNS
 * colour that passes: light on dark surfaces, dark on light ones.
 */
const CONTRAST_GUARD = `<script>
(function () {
  function rgb(c) { var m = /rgba?\\(([^)]+)\\)/.exec(c || ""); if (!m) return null; var p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function bg(el) { for (var e = el; e; e = e.parentElement) { var c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; }
  function reddish(c) { return c.r > 150 && c.r > c.g * 1.6 && c.r > c.b * 1.4; }
  function fix() {
    var all = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i], text = false;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { text = true; break; }
      if (!text || !el.offsetParent) continue;
      var cs = getComputedStyle(el), fg = rgb(cs.color); if (!fg) continue;
      var b = bg(el), l1 = lum(fg), l2 = lum(b), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      var size = parseFloat(cs.fontSize), large = size >= 18.66 || (size >= 14 && Number(cs.fontWeight) >= 700);
      if (ratio >= (large ? 3 : 4.5)) continue;
      var dark = l2 < 0.25;
      el.style.setProperty("color", dark ? (reddish(fg) ? "#fecaca" : "#ffffff") : (reddish(fg) ? "#b91c1c" : "#475467"), "important");
    }
  }
  var t = null;
  function soon() { clearTimeout(t); t = setTimeout(fix, 120); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", soon); else soon();
  window.addEventListener("load", soon);
  new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
})();
</script>`;

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">';

export function themeProPage(html: string, page: string): string {
  // Data the page renders from is content, not styling: leave it byte-exact.
  const masked: string[] = [];
  const mask = (s: string) => `\u0000${masked.push(s) - 1}\u0000`;
  let out = html
    .replace(/<script[^>]*id="sosData"[^>]*>[\s\S]*?<\/script>/g, mask)
    .replace(/const\s+(?:NOTES|tasks)\s*=\s*\[[\s\S]*?\];\s*\n/g, mask);
  const keep = subjectPalette(out);

  // Every `prop: value` declaration, wherever it is written.
  out = out.replace(/([a-z-]+)(\s*:\s*)([^;{}"`<>]*)/gi, (m, prop: string, sep: string, value: string) => {
    const p = prop.toLowerCase();
    if (p === "border-radius" || /^border-(top|bottom)-(left|right)-radius$/.test(p)) return prop + sep + cnsRadius(value);
    if (p === "box-shadow") return prop + sep + cnsShadow(value);
    if (!value.includes("#") || p === "content" || p === "href" || p === "src") return m;
    return prop + sep + value.replace(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => cnsColour(hex, p, keep));
  });

  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => masked[Number(i)]);
  // Links out of the bank leave the frame rather than loading inside it.
  out = out.replace(/<a\b(?![^>]*\btarget=)([^>]*\bhref="https?:\/\/[^"]+")/g, '<a target="_blank" rel="noopener"$1');
  return injectHead(out, FONT_LINK + "\n" + CONTRAST_GUARD, page);
}

// ---------------------------------------------------------------------------
// 4. Pagination (Naveen, 2026-10-15: "instead of load more buttons need
//    pagination and matching colors of UI, but don't skip any questions").
//
// Each list keeps its own loader and its own page size; only "append the next
// batch" becomes "show page N". Server lists jump by setting the page's own
// offset to (N-1) x PAGE_SIZE and calling its own loader — the functions page
// ORDER BY a unique key, so consecutive pages tile the list exactly (crawled:
// every list, no skips, no repeats). Client lists slice the same filtered
// array. The pager takes its colours, radius and font from the page's own
// "load more" button, so each page keeps its look.

/** window.qb2Pager — loaded in <head>, before any page script runs. */
const PAGER_LIB = `<script>
window.qb2Pager = {
  create: function (o) {
    var src = o.styleFrom, cs = src ? getComputedStyle(src) : null;
    function solid(c) { var m = /rgba?\\(([^)]+)\\)/.exec(c || ""); if (!m) return false; var p = m[1].split(",").map(Number); return (p.length < 4 || p[3] > 0) && !(p[0] > 240 && p[1] > 240 && p[2] > 240); }
    var accent = cs ? (solid(cs.backgroundColor) ? cs.backgroundColor : cs.color) : "#0A2463";
    var line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "#D8E3F2";
    var radius = cs ? cs.borderRadius : "12px", font = cs ? cs.fontFamily : "inherit", weight = cs ? cs.fontWeight : "800";
    var nav = document.createElement("nav");
    nav.className = "qb2-pager"; nav.setAttribute("aria-label", "Pagination"); nav.hidden = true;
    var css = document.createElement("style");
    css.textContent =
      ".qb2-pager{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px;margin:22px auto 8px;padding:0 4px}" +
      ".qb2-pager[hidden]{display:none!important}" +
      ".qb2-pager button,.qb2-pager span{min-width:44px;height:44px;padding:0 14px;border-radius:" + radius + ";font:" + weight + " 15px/1 " + font + ";display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}" +
      ".qb2-pager button{background:#fff;color:" + accent + ";border:1px solid " + line + ";cursor:pointer;transition:border-color .15s,background .15s}" +
      ".qb2-pager button:hover:not(:disabled){border-color:" + accent + "}" +
      ".qb2-pager button:focus-visible{outline:2px solid " + accent + ";outline-offset:2px}" +
      ".qb2-pager button[aria-current=page]{background:" + accent + ";color:#fff;border-color:" + accent + ";cursor:default}" +
      ".qb2-pager button:disabled:not([aria-current]){opacity:.4;cursor:default}" +
      ".qb2-pager span{color:" + accent + ";opacity:.6;min-width:20px;padding:0 2px}" +
      ".qb2-pager .qb2-step{padding:0 16px}" +
      "@media (max-width:480px){.qb2-pager{gap:6px}.qb2-pager button,.qb2-pager span{min-width:40px;height:40px;padding:0 10px;font-size:14px}}";
    document.head.appendChild(css);
    var after = o.after || src;
    if (after && after.parentNode) after.parentNode.insertBefore(nav, after.nextSibling);
    var busy = false;
    function go(n) {
      if (busy) return;
      o.onGo(n);
      var top = o.scrollTo ? o.scrollTo() : null;
      if (top && top.getBoundingClientRect) window.scrollTo({ top: Math.max(0, top.getBoundingClientRect().top + window.scrollY - 16), behavior: "smooth" });
    }
    function btn(label, n, opts) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      if (opts && opts.cls) b.className = opts.cls;
      if (opts && opts.aria) b.setAttribute("aria-label", opts.aria);
      if (opts && opts.current) { b.setAttribute("aria-current", "page"); b.disabled = true; }
      else if (opts && opts.disabled) b.disabled = true;
      else b.addEventListener("click", function () { go(n); });
      return b;
    }
    return {
      setBusy: function (v) { busy = !!v; nav.style.pointerEvents = v ? "none" : ""; nav.style.opacity = v ? ".6" : ""; },
      clear: function () { nav.hidden = true; nav.innerHTML = ""; },
      render: function (total, page) {
        var pages = Math.max(1, Math.ceil((Number(total) || 0) / o.pageSize));
        if (o.maxPages) pages = Math.min(pages, o.maxPages);
        page = Math.min(Math.max(1, page || 1), pages);
        nav.innerHTML = "";
        if (pages <= 1) { nav.hidden = true; return; }
        nav.appendChild(btn("‹ Prev", page - 1, { cls: "qb2-step", aria: "Previous page", disabled: page === 1 }));
        var list = [1], from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
        if (page <= 3) to = Math.min(pages - 1, 4);
        if (page >= pages - 2) from = Math.max(2, pages - 3);
        if (from > 2) list.push("…");
        for (var i = from; i <= to; i++) list.push(i);
        if (to < pages - 1) list.push("…");
        list.push(pages);
        list.forEach(function (n) {
          if (n === "…") { var s = document.createElement("span"); s.textContent = "…"; s.setAttribute("aria-hidden", "true"); nav.appendChild(s); }
          else nav.appendChild(btn(String(n), n, { aria: "Page " + n, current: n === page }));
        });
        nav.appendChild(btn("Next ›", page + 1, { cls: "qb2-step", aria: "Next page", disabled: page === pages }));
        nav.hidden = false;
      },
    };
  },
};
</script>`;

/** A sample shows one page: the server caps sample lists at their first page. */
const sampleFlag = (sample: boolean) => `<script>window.qb2Sample=${sample ? "true" : "false"};</script>`;

function injectHead(html: string, insert: string, page: string): string {
  return once(html, "</head>", `${insert}\n</head>`, page);
}

function patchPagination(html: string, kind: PageKind, page: string, sample: boolean): string {
  let out = html;
  const tail = (js: string) => once(out, "</body>", `<script>\n${js}\n</script>\n</body>`, page);

  if (kind.kind === "data" && kind.page === "model") {
    out = once(out, "questionCard(q,start+i+1)", "questionCard(q,(window.qb2Base||0)+start+i+1)", page);
    out = tail(`(function(){
  var pager = qb2Pager.create({ styleFrom: loadMoreButton, after: loadMoreButton, pageSize: PAGE_SIZE, maxPages: window.qb2Sample ? 1 : 0,
    scrollTo: function(){ return resultCount; },
    onGo: function(n){ version++; if(activeRequest) activeRequest.abort(); activeRequest=null; loading=false;
      rows=[]; offset=(n-1)*PAGE_SIZE; window.qb2Base=offset; state("Loading questions...","",true); loadPage(version); } });
  var style = document.createElement("style"); style.textContent = "#loadMoreButton{display:none!important}"; document.head.appendChild(style);
  var origReset = resetSearch;
  resetSearch = function(){ window.qb2Base = 0; pager.clear(); return origReset.apply(this, arguments); };
  var origLoad = loadPage;
  loadPage = async function(){
    if (!rows.length) window.qb2Base = offset;
    var base = window.qb2Base || 0;
    pager.setBusy(true);
    try { await origLoad.apply(this, arguments); } finally { pager.setBusy(false); }
    if (!subjectFilter.value) { pager.clear(); return; }
    pager.render(totalMatches, Math.floor(base / PAGE_SIZE) + 1);
    if (rows.length) resultCount.textContent = totalMatches + " matching " + (totalMatches === 1 ? "question" : "questions") + " · showing " + (base + 1) + "–" + (base + rows.length);
  };
})();`);
  } else if (kind.kind === "data" && kind.page === "previous") {
    out = tail(`(function(){
  var pager = qb2Pager.create({ styleFrom: loadMoreButton, after: loadMoreWrap, pageSize: PAGE_SIZE, maxPages: window.qb2Sample ? 1 : 0,
    scrollTo: function(){ return resultCount; },
    onGo: function(n){ if (loading) return; offset=(n-1)*PAGE_SIZE; questionsEl.innerHTML=""; loadQuestions(false); } });
  var style = document.createElement("style"); style.textContent = "#loadMoreWrap{display:none!important}"; document.head.appendChild(style);
  var origLoad = loadQuestions;
  loadQuestions = async function(reset){
    var base = reset ? 0 : offset;
    pager.setBusy(true);
    try { await origLoad.apply(this, arguments); } finally { pager.setBusy(false); }
    pager.render(totalQuestions, Math.floor(base / PAGE_SIZE) + 1);
    if (offset > base) resultCount.textContent = totalQuestions.toLocaleString() + (totalQuestions === 1 ? " question" : " questions") + " · showing " + (base + 1).toLocaleString() + "–" + offset.toLocaleString();
  };
})();`);
  } else if (kind.kind === "data" && kind.page === "important") {
    // Pages always load fresh (rows cleared), so this batch starts at offset - batch.length.
    out = once(out, "questionCard(q,startIndex + index)", "questionCard(q,(offset - batch.length) + startIndex + index)", page);
    out = tail(`(function(){
  var pager = qb2Pager.create({ styleFrom: loadMoreBtn, after: loadMoreBtn, pageSize: PAGE_SIZE, maxPages: window.qb2Sample ? 1 : 0,
    scrollTo: function(){ return summaryEl; },
    onGo: function(n){ requestVersion++; if(activeController){ activeController.abort(); activeController=null; } loading=false;
      rows=[]; offset=(n-1)*PAGE_SIZE;
      questionsEl.innerHTML='<div class="state"><div class="loader"></div>Loading questions...</div>';
      loadQuestions(requestVersion); } });
  var style = document.createElement("style"); style.textContent = "#loadMore{display:none!important}"; document.head.appendChild(style);
  // The first page loads during the page's own start-up, before this script
  // runs, and the filters hold direct references to resetAndSearch, so
  // neither can be wrapped. renderStatus is called by name after every load;
  // every load starts from cleared rows, so the page began at offset - rows.
  var origStatus = renderStatus;
  renderStatus = function(){
    origStatus.apply(this, arguments);
    var base = Math.max(0, offset - rows.length);
    pager.render(totalMatches, Math.floor(base / PAGE_SIZE) + 1);
    if (rows.length) { summaryEl.textContent = totalMatches + " matching questions · showing " + (base + 1) + "–" + (base + rows.length); endNote.textContent = ""; }
  };
  if (!loading && rows.length) renderStatus();
})();`);
  } else if (kind.kind === "mnemonics") {
    out = once(out, "let limit=PAGE_SIZE;", "let limit=PAGE_SIZE,page=1;var qb2p=null;", page);
    out = once(out, "let visible=matched<=limit;", "let visible=matched>(page-1)*PAGE_SIZE&&matched<=page*PAGE_SIZE;", page);
    // "mnemonics" in semesters 1–7, "clinical cards" in semester 8.
    const label = out.match(/result\.textContent='Showing '\+shown\+' of '\+matched\+' ([a-z ]+)';/);
    if (!label) throw new PatchError(`${page}: mnemonic result line not found`);
    out = once(
      out,
      label[0],
      `result.textContent=matched?'Showing '+((page-1)*PAGE_SIZE+1)+'–'+((page-1)*PAGE_SIZE+shown)+' of '+matched+' ${label[1]}':'Showing 0 of 0 ${label[1]}';`,
      page,
    );
    out = once(out, "more.hidden=matched<=shown;", "more.hidden=true;if(qb2p)qb2p.render(matched,page);", page);
    out = once(out, "function onFilter(){limit=PAGE_SIZE;update()}", "function onFilter(){limit=PAGE_SIZE;page=1;update()}", page);
    out = once(
      out,
      "more.addEventListener('click',()=>{limit+=PAGE_SIZE;update()});",
      "more.addEventListener('click',()=>{limit+=PAGE_SIZE;update()});\n qb2p=qb2Pager.create({styleFrom:more,after:more.parentNode,pageSize:PAGE_SIZE,scrollTo:()=>result,onGo:n=>{page=n;update()}});",
      page,
    );
  } else if (kind.kind === "notes") {
    out = once(out, "if(reset)visible=24;", "if(reset){visible=24;window.qb2NotesPage=1;}", page);
    out = once(
      out,
      "results.slice(0,visible)",
      "results.slice(((window.qb2NotesPage||1)-1)*24,(window.qb2NotesPage||1)*24)",
      page,
    );
    out = once(
      out,
      "els.more.hidden=visible>=results.length;",
      "els.more.hidden=true;if(window.qb2NotesPager)qb2NotesPager.render(results.length,window.qb2NotesPage||1);",
      page,
    );
    out = tail(`window.qb2NotesPager = qb2Pager.create({ styleFrom: els.more, after: els.more, pageSize: 24,
  scrollTo: function(){ return els.counter; },
  onGo: function(n){ window.qb2NotesPage = n; render(); } });
render();`);
  } else if (kind.kind === "sos") {
    out = out.split("state.limit=60").join("state.limit=60,state.qb2Page=1");
    out = once(out, "limit:60,", "limit:60,qb2Page:1,", page);
    out = once(out, "shown=matched.slice(0,state.limit)", "shown=matched.slice((state.qb2Page-1)*60,state.qb2Page*60)", page);
    out = once(
      out,
      "<strong>${shown.length}</strong> of ${matched.length} matching cards shown",
      "<strong>${matched.length?((state.qb2Page-1)*60+1)+'–'+((state.qb2Page-1)*60+shown.length):0}</strong> of ${matched.length} matching cards shown",
      page,
    );
    out = once(out, "more.hidden=matched.length<=shown.length;", "more.hidden=true;if(qb2SosPager)qb2SosPager.render(matched.length,state.qb2Page);", page);
    // The pager is created just before the page's own first render — the last
    // "paperOptions();render();" in the script (each deck sets its semester first).
    const init = out.lastIndexOf("paperOptions();render();");
    if (init < 0 || out.indexOf("paperOptions();render();", init + 1) >= 0) throw new PatchError(`${page}: SOS init not found`);
    out =
      out.slice(0, init) +
      "var qb2SosPager=qb2Pager.create({styleFrom:el('showMore'),after:el('moreWrap'),pageSize:60,scrollTo:()=>el('resultCount'),onGo:n=>{state.qb2Page=n;render()}});\n  " +
      out.slice(init);
  } else {
    return out; // no list on this page
  }
  return injectHead(out, PAGER_LIB + "\n" + sampleFlag(sample), page);
}

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
    ? ` <a target="_top" href="${buyUrl.replace(/"/g, "&quot;")}" style="color:#fff;font-weight:800;text-decoration:underline">Buy full access</a>`
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
  }
  out = patchPagination(out, kind, o.path, !!o.sample || !!o.banner);

  if (o.sample) {
    out = insertAfterBodyTag(out, sampleBanner(o.sample.semester, o.sample.buyUrl), o.path);
  } else if (o.banner) {
    out = insertAfterBodyTag(out, sampleBanner(o.banner.semester, o.banner.buyUrl), o.path);
  }
  return themeProPage(out, o.path);
}
