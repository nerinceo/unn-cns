import Link from "next/link";
import { FileText, Star, Share2 } from "lucide-react";
import { listResumes } from "@/lib/cns/resume";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ResumeUpload } from "@/components/resume/ResumeUpload";
import { NewResumeButton } from "@/components/resume/NewResumeButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resume — UNN CNS" };

export default async function ResumeListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [resumes, { data: uploaded }] = await Promise.all([
    listResumes(),
    supabase
      .from("cns_resume_files")
      .select("id,file_name,size_bytes,created_at")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-semibold">Resume</h1>
          </div>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Build a nursing CV that applicant tracking systems can actually read — and that shows
            your UNN verification.
          </p>
        </div>
        {/* Only in the header when there is already a list. On the empty state
            the call to action lives in the card, so it isn't shown twice. */}
        {resumes.length > 0 && <NewResumeButton hasAny />}
      </header>

      <ResumeUpload current={(uploaded as never) ?? null} />

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Or build one
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generates an ATS-safe CV from your UNN profile, with your verification shown on it.
        </p>
      </div>

      {resumes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No resume yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            We&apos;ll start you off with whatever is already on your UNN profile — your name,
            title and summary — then you fill in the rest.
          </p>
          <div className="mt-4">
            <NewResumeButton hasAny={false} />
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {resumes.map((r) => (
            <li key={r.id}>
              <Link
                href={`/resume/${r.id}`}
                className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium group-hover:text-primary">{r.title}</h2>
                  <div className="flex shrink-0 gap-1.5">
                    {r.is_default && (
                      <span title="Default" className="text-primary">
                        <Star className="h-4 w-4 fill-current" />
                      </span>
                    )}
                    {r.public_token && (
                      <span title="Shared via link" className="text-muted-foreground">
                        <Share2 className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.content?.header?.headline || "No headline yet"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Updated {new Date(r.updated_at).toLocaleDateString()}
                  {" · "}
                  {r.template === "ats" ? "ATS-safe" : "Designed"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
