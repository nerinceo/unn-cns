import Link from "next/link";
import { Building2, Clock, ShieldCheck } from "lucide-react";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";
import { AppShell } from "@/components/shell/AppShell";
import { EmployerRegisterForm } from "@/components/jobs/EmployerRegisterForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "For Employers — UNN CNS" };

/**
 * Registration landing.
 *
 * Renders its OWN shell rather than sitting under a layout, because a layout at
 * app/(employer)/employer/ would also wrap [employerId] — layouts nest in
 * Next.js — and every organisation page would get two headers and two sidebars.
 *
 * Wears the MEMBER chrome deliberately: whoever is here is not an employer yet,
 * that is the point of the page.
 */
export default async function EmployerPage() {
  const [memberships, staff] = await Promise.all([getMyEmployers(), isStaff()]);

  return (
    <AppShell
      portal="member"
      wordmark="CNS"
      employers={memberships.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
    >
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">For Employers</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Post nursing roles to a network of verified nurses. Every applicant arrives with their
          credentials already checked.
        </p>
      </header>

      {memberships.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your organisations
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {memberships.map((m) => {
              const e = m.employer;
              const approved = e.status === "approved";
              return (
                <li key={e.id}>
                  <Link
                    href={`/employer/${e.id}`}
                    className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium group-hover:text-primary">{e.name}</h3>
                      {e.verification_status === "verified" && (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                    <p className="mt-2 text-xs">
                      {approved ? (
                        <span className="text-primary">Approved · you can publish roles</span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> Awaiting UNN approval
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{m.role}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {memberships.length > 0 ? "Register another organisation" : "Register your organisation"}
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            UNN reviews every organisation before its roles go live, so nurses only ever see
            genuine employers. Approval usually takes a working day.
          </p>
          <EmployerRegisterForm />
        </div>
      </section>
    </div>
    </AppShell>
  );
}
