import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ApplicationCard } from "@/components/jobs/ApplicationCard";

export const dynamic = "force-dynamic";

export default async function ApplicationsInbox({
  params,
  searchParams,
}: {
  params: Promise<{ employerId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { employerId } = await params;
  const { job: jobFilter } = await searchParams;
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const { data: jobs } = await supabase
    .from("cns_jobs")
    .select("id,title,slug")
    .eq("employer_id", employerId);
  const jobIds = (jobs ?? []).map((j) => j.id as string);

  // RLS restricts these to jobs belonging to an employer the caller is an
  // approved member of.
  let q = supabase
    .from("cns_job_applications")
    .select(
      "id,job_id,applicant_id,cover_note,profile_snapshot,status,status_changed_at,employer_note,created_at"
    )
    .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });
  if (jobFilter) q = q.eq("job_id", jobFilter);
  const { data: applications } = await q;

  // Contact details are NOT in the snapshot — they are released only once an
  // applicant is shortlisted, which is the promise made on the apply screen.
  // 'selected' is the blueprint's name for what used to be 'offered'; keeping
  // the old name here withheld a hired candidate's contact details.
  const shortlistedIds = (applications ?? [])
    .filter((a) => ["shortlisted", "interview", "selected"].includes(a.status as string))
    .map((a) => a.applicant_id as string);

  const contactById = new Map<string, { email: string | null; phone: string | null }>();
  if (shortlistedIds.length) {
    const { data: contacts } = await supabase
      .from("users")
      .select("id,email,phone")
      .in("id", shortlistedIds);
    for (const c of contacts ?? []) {
      contactById.set(c.id as string, {
        email: (c.email as string) ?? null,
        phone: (c.phone as string) ?? null,
      });
    }
  }

  const jobById = new Map((jobs ?? []).map((j) => [j.id as string, j]));

  return (
    <div className="space-y-6">
      <Link
        href={`/employer/${employerId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {employer.name}
      </Link>

      <header>
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Applications</h1>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Contact details appear once you shortlist an applicant.
        </p>
      </header>

      {(jobs ?? []).length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/employer/${employerId}/applications`}
            className={`rounded-md border px-3 py-1.5 text-xs ${!jobFilter ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
          >
            All
          </Link>
          {(jobs ?? []).map((j) => (
            <Link
              key={j.id}
              href={`/employer/${employerId}/applications?job=${j.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs ${jobFilter === j.id ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              {j.title as string}
            </Link>
          ))}
        </div>
      )}

      {!applications?.length ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No applications yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {applications.map((a) => (
            <li key={a.id as string}>
              <ApplicationCard
                id={a.id as string}
                jobTitle={(jobById.get(a.job_id as string)?.title as string) ?? "Role"}
                snapshot={a.profile_snapshot as Record<string, unknown>}
                coverNote={a.cover_note as string | null}
                status={a.status as string}
                employerNote={a.employer_note as string | null}
                createdAt={a.created_at as string}
                contact={contactById.get(a.applicant_id as string) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
