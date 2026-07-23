import Link from "next/link";
import { BadgeCheck, UserRound, FileText, ShieldCheck, FolderLock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registry — Central Nursing Systems" };

/**
 * Registry hub — the nurse's professional identity in CNS.
 *
 * Profile, CV and verification, gathered in one place. These already exist as
 * routes; Registry is the shell the brief asks for around them. Identity
 * verification itself lives in UNN Hub, so that card links out.
 */
export default async function RegistryHub() {
  const profile = await getCurrentUserProfile();
  const verified = profile?.verification_status === "verified";

  const cards: { href: string; external?: boolean; icon: LucideIcon; title: string; body: string }[] = [
    { href: "/profile", icon: UserRound, title: "Professional profile",
      body: "Role, experience, specialties, licensure and qualifications — the profile employers see when you apply." },
    { href: "/resume", icon: FileText, title: "Resume & documents",
      body: "Build a CV or upload one, stored privately and shared only when you apply." },
    { href: hubLink("/profile/me"), external: true, icon: ShieldCheck, title: "Verification",
      body: verified ? "Your identity is verified. Keep your credentials up to date." : "Complete UNN identity verification to earn your verified badge." },
  ];

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <BadgeCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">Registry</h1>
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" /> Verified
            </span>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Create a professional nursing profile, securely store documents, complete verification
          and keep your credentials updated.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ href, external, icon: Icon, title, body }) =>
          external ? (
            <a
              key={title}
              href={href}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <CardBody Icon={Icon} title={title} body={body} />
            </a>
          ) : (
            <Link
              key={title}
              href={href}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <CardBody Icon={Icon} title={title} body={body} />
            </Link>
          )
        )}
      </section>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Documents you upload are stored privately and never shared without your action. Employers
        see your details only when you apply, and your contact information only if they shortlist you.
      </p>
    </div>
  );
}

function CardBody({ Icon, title, body }: { Icon: LucideIcon; title: string; body: string }) {
  return (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </span>
      <h2 className="mt-4 font-medium group-hover:text-primary">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </>
  );
}
