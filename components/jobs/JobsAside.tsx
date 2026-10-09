import Link from "next/link";
import { ShieldCheck, BellRing, Building2, ArrowRight } from "lucide-react";

/**
 * The right-hand column of the board: verified employers, job alerts, and the
 * way in for hospitals. Beside the results on wide screens, below them
 * otherwise.
 */
export function JobsAside({
  verifiedEmployers,
}: {
  verifiedEmployers: { id: string; name: string; slug: string }[];
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-primary" /> Job alerts
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Get a daily email when a verified employer posts a role in your country and role.
        </p>
        <Link
          href="/saved#alerts"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Set up an alert <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* Only once there are enough to read as a directory rather than a gap. */}
      {verifiedEmployers.length >= 3 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verified employers
          </h2>
          <ul className="mt-3 space-y-1">
            {verifiedEmployers.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/employers/${e.slug}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                    {e.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{e.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Hiring nurses?
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Post roles to verified nurses. Every applicant arrives with their credentials already
          checked.
        </p>
        <Link
          href="/employer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Register your organisation <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </aside>
  );
}
