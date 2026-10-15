import { notFound } from "next/navigation";
import { ChevronDown, SearchX } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { PRO_HOME, PRO_SAMPLE, getMarks, getMnemonics, parseSemester, recordResume, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import { MarkButtons } from "@/components/question-bank/pro/Progress";
import {
  PRO_NAME,
  ProBack,
  ProFooter,
  ProHeader,
  ProPager,
  ProSampleNotice,
  ProSearch,
  linkBuilder,
  pageParam,
  param,
} from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Mnemonics — Semester ${params.semester} — ${PRO_NAME}` };
}

const PAGE_SIZE = 24;
/** The source's names for its mnemonic types. */
const TYPE_LABEL: Record<string, string> = {
  "memory-sentence": "Memory sentences",
  "first-letter": "First-letter sentences",
  sequence: "Sequences & steps",
  comparison: "Comparisons",
  "number-rule": "Number rules",
};

/** "--card-bg:#EAF2FC;--card-ink:#183D70;--card-line:#C5D7EF" → the card's subject colours. */
function palette(style: string | null): React.CSSProperties | undefined {
  if (!style) return undefined;
  const get = (k: string) => style.match(new RegExp(`--card-${k}\\s*:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  const bg = get("bg"), ink = get("ink"), line = get("line");
  return bg && ink && line ? { background: bg, color: ink, borderColor: line } : undefined;
}

/** Mnemonics (nerusalem.in exam-hacks/mnemonics/semester-N.html), 24 a page. */
export default async function ProMnemonicsPage({
  params,
  searchParams,
}: {
  params: { semester: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  const sample = requireSemesterMode(ctx, semester) === "sample";

  const subject = sample ? undefined : param(searchParams, "subject");
  const type = sample ? undefined : param(searchParams, "type");
  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);
  const limit = sample ? PRO_SAMPLE.mnemonics : PAGE_SIZE;
  const data = await getMnemonics(semester, { subject, type, q, limit, offset: (page - 1) * PAGE_SIZE });
  const base = `${PRO_HOME}/${semester}/hacks/mnemonics`;
  const href = linkBuilder(base, { subject, type, q });
  const [marksById] = await Promise.all([
    getMarks(ctx, "mnemonic", data.rows.map((m) => m.id)),
    recordResume(ctx, semester, href({ page }), `Semester ${semester} · Mnemonics${page > 1 ? ` · page ${page}` : ""}`),
  ]);

  return (
    <div className="space-y-5">
      <ProBack href={`${PRO_HOME}/${semester}/hacks`} label={semester === 8 ? "Clinical Hacks" : "Exam Hacks"} />
      <ProHeader eyebrow={`Exam Hacks · Semester ${semester}`} title="Mnemonics" subtitle="Remember more. Revise faster. Choose a card to reveal its meaning." />

      {sample ? (
        <ProSampleNotice semester={semester} shown={data.rows.length} noun="mnemonics" buyUrl={ctx.access.buyUrl} />
      ) : (
        <div className="flex flex-col gap-2">
          <ProSearch action={base} keep={{ subject, type }} value={q} placeholder="Search topics, sentences or keywords" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <FilterSelect
              variant="subject"
              allLabel="All subjects"
              allHref={href({ subject: undefined })}
              options={data.subjects.map((s) => ({ label: s, href: href({ subject: s }), active: s === subject }))}
            />
            <FilterSelect
              variant="type"
              allLabel="All mnemonic types"
              allHref={href({ type: undefined })}
              options={data.types.map((t) => ({ label: TYPE_LABEL[t] ?? t, href: href({ type: t }), active: t === type }))}
            />
          </div>
        </div>
      )}


      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No mnemonics found. Try another topic or select a different subject.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((m) => (
            <article key={m.id} style={palette(m.style)} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
              <div className="flex-1 p-5">
                <p className="text-[12px] font-bold uppercase tracking-wider opacity-80">{m.subject}</p>
                <h3 className="mt-2 text-[17px] font-bold leading-snug">{m.topic}</h3>
                <p className="mt-4 text-[12px] font-bold uppercase tracking-wider opacity-70">{m.label || "Remember this"}</p>
                <p className="mt-1 text-[21px] font-bold leading-snug">{m.sentence}</p>
              </div>
              <details className="group border-t border-black/10 bg-white/55 px-5 py-3 dark:bg-black/10">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-bold">
                  Reveal meaning
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed">{m.meaning}</p>
              </details>
              <div className="border-t border-black/10 bg-white/70 px-5 py-2.5 dark:bg-black/10">
                <MarkButtons kind="mnemonic" item={m.id} saved={marksById[String(m.id)]?.saved} compact />
              </div>
            </article>
          ))}
        </div>
      )}

      {!sample && <ProPager page={page} pages={Math.ceil(data.total / PAGE_SIZE)} href={(n) => href({ page: n })} />}
      <ProFooter />
    </div>
  );
}
