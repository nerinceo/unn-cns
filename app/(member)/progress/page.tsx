import Link from "next/link";
import { TrendingUp, Target, ListChecks, Layers, ClipboardList, ArrowRight, AlertTriangle } from "lucide-react";
import { getProgress } from "@/lib/cns/progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress — Central Nursing Systems" };

/**
 * Progress dashboard.
 *
 * Built from cns_user_topic_progress (kept current by the grader) and the
 * user's own attempts. Subject accuracy, weakest topics to revise, and recent
 * attempts. No charting library — a filled bar reads a percentage fine and
 * keeps the page fast and theme-safe.
 */
export default async function ProgressPage() {
  const p = await getProgress();

  if (!p.hasData) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium">No progress yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Take a practice set in the Question Bank and your accuracy, weak topics and history
            will build here.
          </p>
          <Link
            href="/question-bank/mcq"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Go to Question Bank
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Header />

      {/* Summary tiles */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Target} label="Overall accuracy" value={`${p.totals.accuracy}%`} />
        <Stat icon={ListChecks} label="Questions practised" value={p.totals.seen.toLocaleString()} />
        <Stat icon={Layers} label="Topics covered" value={p.totals.topics.toLocaleString()} />
        <Stat icon={ClipboardList} label="Sets completed" value={p.totals.attempts.toLocaleString()} />
      </section>

      {/* Accuracy by subject */}
      {p.subjects.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Accuracy by subject
          </h2>
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            {p.subjects.map((s) => (
              <div key={s.subjectId}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{s.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {s.accuracy}% · {s.correct}/{s.seen}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, s.accuracy)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Weak topics */}
        {p.weakTopics.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Revise next
            </h2>
            <ul className="space-y-2">
              {p.weakTopics.map((t) => (
                <li
                  key={t.topicId}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-secondary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    {t.subject && <p className="truncate text-xs text-muted-foreground">{t.subject}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-medium text-secondary">{Math.round(t.mastery)}%</span>
                </li>
              ))}
            </ul>
            <Link href="/question-bank/mcq" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Practice these <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>
        )}

        {/* Recent attempts */}
        {p.recent.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Recent attempts
            </h2>
            <ul className="space-y-2">
              {p.recent.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.correct}/{a.total} correct · {new Date(a.when).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                      a.scorePct >= 50 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {a.scorePct}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-semibold sm:text-3xl">Progress</h1>
      </div>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Your learning across CNS — accuracy by subject, the topics to revise next, and your recent
        practice.
      </p>
    </header>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
