import Link from "next/link";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/supabase/server";
import { toAccountScope } from "@/lib/access";
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
    // The CHROME must never be able to take down the page it wraps. This shell
    // is the layout for every job and employer page — the acquisition funnel —
    // so a failure fetching the portal switcher's contents used to render a
    // full-page "server-side exception" over a job that was itself perfectly
    // fine. Same principle recordJobView() already states: a thrown error costs
    // the applicant.
    //
    // The console.error matters as much as the catch: a Server Component throw
    // reaches production as an opaque digest with the message stripped, which
    // is unreadable. Logging here puts the real error in the runtime log while
    // the page still renders.
    let employers: { id: string; name: string }[] = [];
    let staff = false;
    // A 'uhn'-scoped professional gets the job-board nav rather than the nursing
    // one. Inside the same try as the chrome lookups: if the profile read fails
    // this falls back to `false`, which shows the nurse nav — wrong, but every
    // item on it is refused by middleware, so the failure mode is a confusing
    // page rather than an exposed one.
    let professional = false;
    try {
      // getMyEmployers() now drops memberships whose employer join came back
      // null, so `m.employer` here is genuinely non-null rather than asserted.
      const [rows, isStaffUser, profile] = await Promise.all([
        getMyEmployers(),
        isStaff(),
        getCurrentUserProfile(),
      ]);
      employers = rows.map((m) => ({ id: m.employer.id, name: m.employer.name }));
      staff = isStaffUser;
      professional = toAccountScope(profile?.account_scope) === "uhn";
    } catch (err) {
      console.error("[CrawlableShell] portal chrome failed; rendering without it:", err);
    }

    return (
      <AppShell
        portal="member"
        wordmark="CNS"
        employers={employers}
        isStaff={staff}
        professional={professional}
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
              Nerusalem
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
