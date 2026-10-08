import { notFound } from "next/navigation";
import { Building2, Globe, MapPin } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff } from "@/lib/cns/admin";
import { EmployerReviewActions } from "@/components/jobs/EmployerReviewActions";
import { EmployerDocButton } from "@/components/jobs/EmployerDocButton";
import { safeExternalUrl } from "@/lib/cns/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employer approvals — Central Nerusalem Space" };

export default async function AdminEmployersPage() {
  // 404 rather than a redirect: a non-staff member should not learn that this
  // page exists.
  if (!(await isStaff())) notFound();

  // Service role: review_note is no longer in the authenticated column grant
  // (0064 section 9, E-B-001), and this list is staff-only (checked above).
  const supabase = createAdminClient();
  // legal_name … registration_doc_key: approval marks an organisation
  // verified, so the reviewer must see what it submitted for verification.
  // These were collected and never shown (found 2026-10-08).
  const { data: employers } = await supabase
    .from("cns_employers")
    .select(
      "id,name,slug,employer_type,description,website,country,city,status,verification_status,review_note,created_at,legal_name,contact_person,business_email,phone,registration_doc_key"
    )
    .order("created_at", { ascending: false });

  const pending = (employers ?? []).filter((e) => e.status === "pending");
  const decided = (employers ?? []).filter((e) => e.status !== "pending");

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Employer approvals</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Nothing an organisation posts reaches the public job board until it is approved here.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Awaiting review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Nothing waiting.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{e.name}</h3>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {e.employer_type}
                    </p>
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {(e.city || e.country) && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[e.city, e.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {e.website && (
                        <a
                          href={safeExternalUrl(e.website as string) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          {e.website}
                        </a>
                      )}
                    </dl>
                    {e.description && (
                      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{e.description}</p>
                    )}
                    <div className="mt-3 max-w-xl rounded-md border border-border bg-muted/30 p-3 text-xs">
                      <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">
                        Verification details
                        {e.verification_status === "submitted" && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 normal-case tracking-normal text-primary">
                            submitted for verification
                          </span>
                        )}
                      </p>
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <Detail label="Legal name" value={e.legal_name as string | null} />
                        <Detail label="Contact person" value={e.contact_person as string | null} />
                        <Detail label="Business email" value={e.business_email as string | null} />
                        <Detail label="Phone" value={e.phone as string | null} />
                      </dl>
                      <div className="mt-2">
                        {e.registration_doc_key ? (
                          <EmployerDocButton employerId={e.id as string} />
                        ) : (
                          <span className="text-secondary">No registration document uploaded.</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <EmployerReviewActions employerId={e.id as string} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Reviewed
          </h2>
          <ul className="space-y-2">
            {decided.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm"
              >
                <span className="min-w-0 flex-1 font-medium">{e.name}</span>
                <span
                  className={
                    e.status === "approved"
                      ? "rounded bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary"
                      : "rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground"
                  }
                >
                  {e.status}
                </span>
                <EmployerReviewActions employerId={e.id as string} compact current={e.status as string} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || <span className="text-secondary">not provided</span>}</dd>
    </div>
  );
}
