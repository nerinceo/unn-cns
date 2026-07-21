import Link from "next/link";
import { BookOpen, ClipboardList, Briefcase, ShieldCheck } from "lucide-react";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * CNS dashboard — and the single page that proves the whole architecture.
 *
 * Rendering a name here means: the auth cookie crossed from app.unnhub.org to
 * cns.unnhub.org, getClaims() verified it locally against the shared JWKS, and
 * the public.users row resolved under the same RLS — from a separate repo and a
 * separate deployment, with no second login and no duplicated user table.
 */
export default async function CnsHomePage() {
  const profile = await getCurrentUserProfile();
  const firstName = (profile?.full_name as string | undefined)?.split(" ")[0] ?? "there";
  const verified = profile?.verification_status === "verified";

  const modules = [
    {
      href: "/learn",
      icon: BookOpen,
      title: "Learn",
      body: "Structured courses with lessons, video and progress tracking.",
    },
    {
      href: "/question-bank",
      icon: ClipboardList,
      title: "Question Bank",
      body: "Practice sets and past papers across multiple universities.",
    },
    {
      href: "/jobs",
      icon: Briefcase,
      title: "Jobs",
      body: "Nursing roles from verified hospitals and agencies.",
    },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Welcome back, {firstName}</h1>
        <p className="mt-1 text-muted-foreground">
          You are signed in with your UNN account — no second login needed.
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="font-medium">{profile?.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{profile?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium capitalize">
              {String(profile?.role ?? "—").replace(/_/g, " ")}
            </dd>
          </div>
          {verified && (
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1 font-medium text-primary">
                <ShieldCheck className="h-4 w-4" /> Verified
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ href, icon: Icon, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-medium group-hover:text-primary">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
