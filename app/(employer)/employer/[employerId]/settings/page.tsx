import { notFound } from "next/navigation";
import { ShieldCheck, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VerificationPanel } from "@/components/employer/VerificationPanel";
import { readEmployerDocKey } from "@/lib/cns/employer-doc-access";
import { getEmployerPrivate } from "@/lib/cns/employer-private";

export const dynamic = "force-dynamic";

export default async function EmployerSettings({
  params,
}: {
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  const { data: publicRow } = await supabase
    .from("cns_employers")
    .select("id,name,slug,employer_type,description,website,country,city,status,verification_status,created_at")
    .eq("id", employerId)
    .maybeSingle();
  if (!publicRow) notFound();
  // Contact details and legal name are private (E-B-001): read for members and
  // staff through getEmployerPrivate, never through the public column grant.
  const priv = await getEmployerPrivate(employerId);
  if (!priv) notFound();
  const employer = {
    ...publicRow,
    email: priv.email,
    phone: priv.phone,
    legal_name: priv.legal_name,
    contact_person: priv.contact_person,
    business_email: priv.business_email,
  };

  const [{ data: members }, { data: history }] = await Promise.all([
    supabase
      .from("cns_employer_members")
      .select("id,user_id,role,status")
      .eq("employer_id", employerId),
    supabase
      .from("cns_employer_verifications")
      .select("id,status,note,created_at")
      .eq("employer_id", employerId)
      .order("created_at", { ascending: false }),
  ]);

  // The key is service-role only and never crosses to the client — the panel
  // gets a boolean and a format label, nothing that reveals the bucket path.
  const docKey = await readEmployerDocKey(employerId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Organisation</h1>
      </header>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
        <Row label="Name">{employer.name as string}</Row>
        <Row label="Type">
          <span className="capitalize">{employer.employer_type as string}</span>
        </Row>
        <Row label="Location">
          {[employer.city, employer.country].filter(Boolean).join(", ") || "—"}
        </Row>
        <Row label="Website">{(employer.website as string) || "—"}</Row>
        <Row label="Status">
          {employer.status === "approved" ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Approved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 capitalize text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {employer.status as string}
            </span>
          )}
        </Row>
        <Row label="Registered">
          {new Date(employer.created_at as string).toLocaleDateString()}
        </Row>
      </dl>

      <VerificationPanel
        state={{
          employerId,
          status: (employer.verification_status as string) ?? "unverified",
          hasDocument: Boolean(docKey),
          // Storage keys are randomised, so the key's basename is meaningless
          // to the person who uploaded it. Show the format instead of a name
          // they will not recognise; Open is there if they want to check.
          documentName: docKey
            ? `Registration document (${(docKey.split(".").pop() ?? "file").toUpperCase()})`
            : null,
          legalName: (employer.legal_name as string) ?? null,
          contactPerson: (employer.contact_person as string) ?? null,
          businessEmail: (employer.business_email as string) ?? null,
          phone: (employer.phone as string) ?? null,
          history: (history ?? []).map((h) => ({
            id: h.id as string,
            status: h.status as string,
            note: (h.note as string) ?? null,
            created_at: h.created_at as string,
          })),
        }}
      />

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Team ({members?.length ?? 0})
        </h2>
        <ul className="space-y-2">
          {(members ?? []).map((m) => (
            <li
              key={m.id as string}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
            >
              <span className="flex-1 capitalize">{m.role as string}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.status as string}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Inviting colleagues is not built yet — contact Nerusalem to add a recruiter.
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}
