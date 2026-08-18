import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";
import { hubLink } from "@/lib/hub";

/**
 * Chrome for the pages that live OUTSIDE the members-only route groups.
 *
 * Job pages and employer profiles must be crawlable for their schema.org
 * markup to reach Google, which is the only realistic acquisition channel for
 * a new board. Applying still requires a session — which is also the right
 * funnel: Google → job page → sign in to apply.
 *
 * The chrome adapts: a signed-in member gets the normal member portal shell,
 * an anonymous visitor a minimal public header with a way in.
 *
 * Shared rather than copied. /employers/[slug] originally shipped with no
 * layout at all and rendered as naked content — no header, no nav, no footer,
 * and no sign-in call to action on a page whose whole purpose is to be the
 * landing point for someone searching a hospital's name.
 */
export async function CrawlableShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (user) {
    const [employers, staff] = await Promise.all([getMyEmployers(), isStaff()]);
    return (
      <AppShell
        portal="member"
        wordmark="CNS"
        employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
        isStaff={staff}
      >
        {children}
      </AppShell>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-card">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-4 px-4">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">
              UNN
            </span>
            <span className="text-lg font-semibold text-primary">Nursing Jobs</span>
          </Link>
          <a
            href={hubLink("/welcome")}
            className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in to apply
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Nursing roles from verified hospitals and agencies on the{" "}
        <a href={hubLink("/welcome")} className="text-primary hover:underline">
          United Nurses Network
        </a>
        .
      </footer>
    </>
  );
}
