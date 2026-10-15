import Link from "next/link";
import { Bookmark, ChevronDown, SearchX } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import {
  PRO_HOME,
  getSaved,
  getResume,
  parseSemester,
  questionOptions,
  requireProBank,
  resumeWhen,
  type MarkKind,
  type ProQuestionRow,
  type RevisionNote,
  type SosCard,
} from "@/lib/cns/qbank-pro";
import { formatAnswer, formatNoteHtml } from "@/lib/cns/qbank-pro-format";
import { PRO_NAME, ProBack, ProFooter, ProHeader, ProPager, linkBuilder, pageParam, param } from "@/components/question-bank/pro/ProChrome";
import { ProQuestionCard } from "@/components/question-bank/pro/ProQuestionCard";
import { ContinueCard, MarkButtons } from "@/components/question-bank/pro/Progress";

export const dynamic = "force-dynamic";
export const metadata = { title: `Saved — ${PRO_NAME}` };

const PAGE_SIZE = 20;
const KINDS: { value: MarkKind; label: string }[] = [
  { value: "q", label: "Questions" },
  { value: "mnemonic", label: "Mnemonics" },
  { value: "note", label: "Revision notes" },
  { value: "sos", label: "SOS cards" },
];

/**
 * Saved (Naveen, 2026-10-15): everything the member saved for later, and where
 * they left off — from any device. No done-tracking or percentages on purpose:
 * students felt it would overwhelm them.
 */
export default async function ProSavedPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await requireProBank();
  const kind = (KINDS.find((k) => k.value === param(searchParams, "type"))?.value ?? "q") as MarkKind;
  const semester = parseSemester(param(searchParams, "semester") ?? "");
  const page = pageParam(searchParams);
  const base = `${PRO_HOME}/saved`;
  const href = linkBuilder(base, { type: kind === "q" ? undefined : kind, semester: semester ? String(semester) : undefined });

  const [resume, list] = await Promise.all([
    getResume(ctx),
    ctx.userId ? getSaved(ctx, kind, semester, PAGE_SIZE, (page - 1) * PAGE_SIZE) : Promise.resolve({ total: 0, rows: [] }),
  ]);
  const last = resume[0];
  const mark = { saved: true };

  return (
    <div className="space-y-6">
      <ProBack href={PRO_HOME} label="Semesters" />
      <ProHeader eyebrow={PRO_NAME} title="Saved" subtitle="Questions and cards you saved for later, and where you left off." icon={<Bookmark className="h-6 w-6" />} />

      {last && <ContinueCard href={last.path} label={last.label} when={resumeWhen(last.at)} savedHref={base} />}

      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={href({ type: k.value === "q" ? undefined : k.value })}
            className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-inset ${
              k.value === kind ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-slate-700 ring-border hover:ring-primary dark:text-slate-300"
            }`}
          >
            {k.label}
          </Link>
        ))}
        <div className="ml-auto">
          <FilterSelect
            variant="category"
            allLabel="All semesters"
            allHref={href({ semester: undefined })}
            widthClass="w-56"
            options={Array.from({ length: 8 }, (_, i) => i + 1).map((n) => ({ label: `Semester ${n}`, href: href({ semester: n }), active: n === semester }))}
          />
        </div>
      </div>

      {list.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">
            Nothing saved here yet. Use Save on any question or card.
          </p>
        </div>
      ) : kind === "q" ? (
        <div className="space-y-4">
          {(list.rows as unknown as (ProQuestionRow & { semester: number })[]).map((x, i) => (
            <ProQuestionCard
              key={x.id}
              q={{
                id: x.id,
                number: (page - 1) * PAGE_SIZE + i + 1,
                question: x.question,
                type: x.question_type,
                marks: x.marks,
                subject: `Semester ${x.semester} · ${x.official_subject_name ?? ""}`,
                unit: x.official_unit_name,
                drawing: x.diagram_needed === true,
                options: questionOptions(x),
                correctOption: x.correct_option,
                answerHtml: formatAnswer(x.answer_formatted || x.answer),
                rationaleHtml: formatAnswer(x.rationale),
                tipHtml: formatAnswer(x.exam_tip),
                mark,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.rows.map((r) => {
            if (kind === "mnemonic") {
              const m = r as { id: number; subject: string; topic: string; sentence: string; meaning: string; semester: number };
              return (
                <article key={m.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-primary">Semester {m.semester} · {m.subject}</p>
                  <h3 className="mt-2 text-[17px] font-bold">{m.topic}</h3>
                  <p className="mt-2 text-[18px] font-bold leading-snug">{m.sentence}</p>
                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-bold text-primary">
                      Reveal meaning <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-[15px] leading-relaxed">{m.meaning}</p>
                  </details>
                  <div className="mt-auto pt-4">
                    <MarkButtons kind="mnemonic" item={m.id} {...mark} compact />
                  </div>
                </article>
              );
            }
            if (kind === "note") {
              const n = r as unknown as RevisionNote & { semester: number };
              const parts = (n.html_parts ?? (n.html ? [n.html] : Array.isArray(n.note) ? n.note : n.note ? [n.note] : [])).map(formatNoteHtml);
              return (
                <article key={n._id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-primary">Semester {n.semester} · {n.subject}</p>
                  {n.topic && <h3 className="mt-2 text-[17px] font-bold">{n.topic}</h3>}
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[14.5px] leading-relaxed [&_strong]:font-bold [&_strong]:text-primary">
                    {parts.map((h, k) => (
                      <li key={k} dangerouslySetInnerHTML={{ __html: h }} />
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <MarkButtons kind="note" item={n._id} {...mark} compact />
                  </div>
                </article>
              );
            }
            const c = r as unknown as SosCard & { _semester: number | null };
            return (
              <article key={c._id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
                <p className="text-[12px] font-bold uppercase tracking-wider text-primary">{c._semester ? `Semester ${c._semester}` : "General"} · {c.id}</p>
                <h3 className="mt-2 text-[17px] font-bold">{c.title}</h3>
                {c.summary && <p className="mt-1 text-[14.5px] text-slate-700 dark:text-slate-300">{c.summary}</p>}
                {c.steps && c.steps.length > 0 && (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed">
                    {c.steps.map((s, k) => (
                      <li key={k}>{s}</li>
                    ))}
                  </ol>
                )}
                <div className="mt-auto pt-4">
                  <MarkButtons kind="sos" item={c._id} {...mark} compact />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ProPager page={page} pages={Math.ceil(list.total / PAGE_SIZE)} href={(n) => href({ page: n })} />
      <ProFooter />
    </div>
  );
}
