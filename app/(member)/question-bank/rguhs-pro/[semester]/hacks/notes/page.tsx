import { notFound } from "next/navigation";
import { SearchX } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import {
  PRO_HOME,
  PRO_SAMPLE,
  getMarks,
  getNotes,
  parseSemester,
  recordResume,
  requireProBank,
  requireSemesterMode,
  type RevisionNote,
} from "@/lib/cns/qbank-pro";
import { MarkButtons } from "@/components/question-bank/pro/Progress";
import { formatNoteHtml } from "@/lib/cns/qbank-pro-format";
import {
  PRO_NAME,
  ProBack,
  ProCountBar,
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
  return { title: `${params.semester === "8" ? "Clinical Notes" : "Revision Notes"} — Semester ${params.semester} — ${PRO_NAME}` };
}

const PAGE_SIZE = 24;

/** The note's own paragraphs: the first introduces, the rest are its points. */
function NoteBody({ n }: { n: RevisionNote }) {
  const parts = (n.html_parts ?? (n.html ? [n.html] : Array.isArray(n.note) ? n.note : n.note ? [n.note] : [])).filter(Boolean);
  if (!parts.length) return null;
  const [first, ...rest] = parts.map(formatNoteHtml);
  return (
    <div className="mt-3 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 [&_strong]:font-bold [&_strong]:text-primary dark:[&_strong]:text-blue-300">
      <p dangerouslySetInnerHTML={{ __html: first }} />
      {rest.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-primary">
          {rest.map((h, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: h }} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Quick Revision (nerusalem.in exam-hacks/revision-notes/semester-N.html); semester 8 is Clinical Notes. */
export default async function ProNotesPage({
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
  const clinical = semester === 8;

  const subject = sample ? undefined : param(searchParams, "subject");
  const unit = sample ? undefined : param(searchParams, "unit");
  const type = sample ? undefined : param(searchParams, "type");
  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);
  const data = await getNotes(semester, { subject, unit, type, q, limit: sample ? PRO_SAMPLE.notes : PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const base = `${PRO_HOME}/${semester}/hacks/notes`;
  const href = linkBuilder(base, { subject, unit, type, q });
  const [marksById] = await Promise.all([
    getMarks(ctx, "note", data.rows.map((n) => n._id)),
    recordResume(ctx, semester, href({ page }), `Semester ${semester} · ${clinical ? "Clinical Notes" : "Revision Notes"}${page > 1 ? ` · page ${page}` : ""}`),
  ]);

  return (
    <div className="space-y-5">
      <ProBack href={`${PRO_HOME}/${semester}/hacks`} label={clinical ? "Clinical Hacks" : "Exam Hacks"} />
      <ProHeader
        eyebrow={`Exam Hacks · Semester ${semester}`}
        title={clinical ? "Clinical Notes" : "Quick Revision"}
        subtitle={clinical ? "Practical clinical learning notes for internship." : "Study smarter. Revise faster."}
      />

      {sample ? (
        <ProSampleNotice semester={semester} shown={data.rows.length} total={data.all} noun="notes" buyUrl={ctx.access.buyUrl} />
      ) : (
        <div className="flex flex-col gap-2">
          <ProSearch action={base} keep={{ subject, unit, type }} value={q} placeholder="Search topics or keywords" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {data.subjects.length > 1 && (
              <FilterSelect
                variant="subject"
                allLabel="All subjects"
                allHref={href({ subject: undefined, unit: undefined })}
                options={data.subjects.map((s) => ({ label: s, href: href({ subject: s, unit: undefined }), active: s === subject }))}
              />
            )}
            {data.units.length > 1 && (
              <FilterSelect
                variant="unit"
                allLabel="All units"
                allHref={href({ unit: undefined })}
                widthClass="w-[24rem]"
                options={data.units.map((u) => ({ label: u.name, href: href({ unit: u.code }), active: u.code === unit }))}
              />
            )}
            {data.types.length > 1 && (
              <FilterSelect
                variant="type"
                allLabel="All types"
                allHref={href({ type: undefined })}
                options={data.types.map((t) => ({ label: t, href: href({ type: t }), active: t === type }))}
              />
            )}
          </div>
        </div>
      )}

      {!sample && <ProCountBar from={data.total ? (page - 1) * PAGE_SIZE + 1 : 0} to={(page - 1) * PAGE_SIZE + data.rows.length} total={data.total} noun="notes" />}

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No matching notes. Try another topic or filter.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((n) => (
            <article key={n._id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[12.5px] font-bold uppercase tracking-wider text-primary">{n.subject}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">{n.id}</span>
              </div>
              {n.unit_name && <p className="mt-1 text-[13px] text-muted-foreground">{n.unit_name}</p>}
              {n.topic && <h3 className="mt-2 border-b border-border pb-2 text-[18px] font-bold leading-snug">{n.topic}</h3>}
              <NoteBody n={n} />
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-[12.5px] font-semibold text-muted-foreground">
                <span>{n.type ?? (clinical ? "Clinical note" : "Note")}</span>
                <span>Semester {semester}</span>
              </div>
              <div className="mt-3">
                <MarkButtons kind="note" item={n._id} saved={marksById[String(n._id)]?.saved} compact />
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
