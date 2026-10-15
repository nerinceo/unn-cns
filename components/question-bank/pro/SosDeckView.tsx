import Link from "next/link";
import { AlertTriangle, LifeBuoy, ListChecks, SearchX, Zap } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { getMarks, getSos, recordResume, type ProContext } from "@/lib/cns/qbank-pro";
import {
  ProFooter,
  ProHeader,
  ProPager,
  ProSampleNotice,
  ProSearch,
  linkBuilder,
  pageParam,
  param,
} from "@/components/question-bank/pro/ProChrome";
import { MarkButtons } from "@/components/question-bank/pro/Progress";

const PAGE_SIZE = 60;

/**
 * Exam SOS (nerusalem.in exam-hacks/exam-sos/*.html): help cards grouped into
 * the deck's categories, filtered by category, paper and search, 60 a page.
 * Shared by the semester decks and the general deck.
 */
export async function SosDeckView({
  ctx,
  deck,
  base,
  back,
  title,
  eyebrow,
  sample,
  sampleSize,
  sampleSemester,
  buyUrl,
  searchParams,
}: {
  ctx: ProContext;
  deck: string;
  base: string;
  back: React.ReactNode;
  title: string;
  eyebrow: string;
  sample: boolean;
  sampleSize: number;
  sampleSemester: number | null;
  buyUrl: string | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const category = sample ? undefined : param(searchParams, "category");
  const paper = sample ? undefined : param(searchParams, "paper");
  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);
  const data = await getSos(deck, { category, paper, q, limit: sample ? sampleSize : PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const cats = data.deck?.categories ?? [];
  const label = (slug: string) => cats.find((c) => c.slug === slug)?.label ?? slug;
  const href = linkBuilder(base, { category, paper, q });
  const [marksById] = await Promise.all([
    getMarks(ctx, "sos", data.rows.map((r) => r._id)),
    recordResume(ctx, sampleSemester ?? 0, href({ page }), `${sampleSemester ? `Semester ${sampleSemester} · ` : ""}${title}${page > 1 ? ` · page ${page}` : ""}`),
  ]);
  const lanes = cats
    .map((c) => ({ ...c, cards: data.rows.filter((r) => r.category === c.slug) }))
    .concat([{ slug: "_other", label: "More help", description: "", cards: data.rows.filter((r) => !cats.some((c) => c.slug === r.category)) }])
    .filter((l) => l.cards.length > 0);

  return (
    <div className="space-y-5">
      {back}
      <ProHeader
        eyebrow={eyebrow}
        title={title}
        subtitle="Exam coming soon? Simple exam tips, subject revision cards, answer-writing help and exam-hall advice. Save a card, and mark it when you finish."
        icon={<LifeBuoy className="h-6 w-6" />}
      />

      {sample ? (
        <ProSampleNotice semester={sampleSemester} shown={data.rows.length} noun="SOS cards" buyUrl={buyUrl} />
      ) : (
        <>
          <nav aria-label="Categories" className="flex flex-wrap gap-2">
            <Link
              href={href({ category: undefined })}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-inset ${!category ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-slate-700 ring-border hover:ring-primary dark:text-slate-300"}`}
            >
              All SOS · {Object.values(data.category_counts).reduce((a, b) => a + b, 0)}
            </Link>
            {cats.map((c) => (
              <Link
                key={c.slug}
                href={href({ category: c.slug })}
                className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-inset ${c.slug === category ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-slate-700 ring-border hover:ring-primary dark:text-slate-300"}`}
              >
                {c.label} · {data.category_counts[c.slug] ?? 0}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ProSearch action={base} keep={{ category, paper }} value={q} placeholder="Search SOS cards" />
            {data.papers.length > 1 && (
              <FilterSelect
                variant="paper"
                allLabel="All subjects"
                allHref={href({ paper: undefined })}
                options={data.papers.map((p) => ({ label: p.name, href: href({ paper: p.code }), active: p.code === paper }))}
              />
            )}
          </div>
        </>
      )}

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No SOS cards match. Try another category or search.</p>
        </div>
      ) : (
        lanes.map((lane, i) => (
          <section key={lane.slug} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tabular-nums text-primary-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-[17px] font-bold">{lane.label}</h2>
                {lane.description && <p className="text-[13.5px] text-muted-foreground">{lane.description}</p>}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lane.cards.map((c) => (
                <article key={c._id} id={c.id} className="flex flex-col rounded-2xl border border-border bg-card shadow-card">
                  <div className="rounded-t-2xl border-b border-border bg-brand-50 p-5 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold tabular-nums text-muted-foreground">{c.id}</span>
                      <span className="rounded-full bg-card px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/20">
                        {label(c.category)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-[18px] font-bold leading-snug">{c.title}</h3>
                    {c.summary && <p className="mt-1 text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-300">{c.summary}</p>}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {(c.paper_name || c.semester) && (
                      <p className="text-[12.5px] font-bold uppercase tracking-wide text-primary">
                        {[c.semester ? `Semester ${c.semester}` : null, c.paper_code ? `QP ${c.paper_code}` : null, c.paper_name].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {c.steps && c.steps.length > 0 && (
                      <>
                        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-foreground">
                          <ListChecks className="h-4 w-4 text-primary" /> What to do
                        </p>
                        <ol className="mt-2 space-y-2">
                          {c.steps.map((s, k) => (
                            <li key={k} className="flex gap-2.5 text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-200">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-[12px] font-bold text-primary ring-1 ring-inset ring-primary/15">
                                {k + 1}
                              </span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                    {c.watch_out && (
                      <div className="mt-4 rounded-lg bg-danger-soft p-3">
                        <p className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" /> Avoid this
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed text-red-900 dark:text-red-200">{c.watch_out}</p>
                      </div>
                    )}
                    {c.rescue_move && (
                      <div className="mt-3 rounded-lg bg-success-soft p-3">
                        <p className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-success">
                          <Zap className="h-3.5 w-3.5" /> Rescue move
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed text-emerald-950 dark:text-emerald-100">{c.rescue_move}</p>
                      </div>
                    )}
                    <div className="mt-auto pt-4">
                      <MarkButtons kind="sos" item={c._id} saved={marksById[String(c._id)]?.saved} compact />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {!sample && <ProPager page={page} pages={Math.ceil(data.total / PAGE_SIZE)} href={(n) => href({ page: n })} />}
      {data.deck?.notice && <p className="text-center text-[13px] text-muted-foreground">{data.deck.notice}</p>}
      <ProFooter />
    </div>
  );
}
