import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { CnsHeader } from "@/components/shell/CnsHeader";
import { CnsSidebar } from "@/components/shell/CnsSidebar";
import { CnsMobileNav } from "@/components/shell/CnsMobileNav";
import { hubLink } from "@/lib/hub";

/**
 * Jobs sits OUTSIDE the (cns) members-only group on purpose.
 *
 * Job pages must be crawlable for schema.org/JobPosting markup to reach Google
 * for Jobs, which is the only realistic acquisition channel for a new board.
 * Applying still requires a session — that is also the right funnel: Google →
 * job page → sign in to apply.
 *
 * So the chrome adapts: members get the normal CNS shell, anonymous visitors
 * get a minimal public header with a sign-in call to action.
 */
export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (user) {
    return (
      <>
        <CnsHeader />
        <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-24 pt-6 md:pb-8">
          <CnsSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <CnsMobileNav />
      </>
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
