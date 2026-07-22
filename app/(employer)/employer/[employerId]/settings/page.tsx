import { notFound } from "next/navigation";
import { ShieldCheck, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployerSettings({
  params,
}: {
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select(
      "id,name,slug,employer_type,description,website,email,phone,country,city,status,verification_status,created_at"
    )
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const { data: members } = await supabase
    .from("cns_employer_members")
    .select("id,user_id,role,status")
    .eq("employer_id", employerId);

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
          Inviting colleagues is not built yet — contact UNN to add a recruiter.
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
