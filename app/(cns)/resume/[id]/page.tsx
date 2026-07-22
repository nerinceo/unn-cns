import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getResume, seedCoverage, EMPTY_CONTENT } from "@/lib/cns/resume";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { ResumeEditor } from "@/components/resume/ResumeEditor";
import { ShareControl } from "@/components/resume/ShareControl";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // RLS scopes cns_resumes to the owner, so someone else's id reads as null.
  const [resume, profile] = await Promise.all([getResume(id), getCurrentUserProfile()]);
  if (!resume) notFound();

  const content = { ...EMPTY_CONTENT, ...(resume.content ?? {}) };
  const coverage = seedCoverage(content);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/resume"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Resumes
        </Link>
        <ShareControl resumeId={resume.id} token={resume.public_token} />
      </div>

      {coverage.isEssentiallyEmpty && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm print:hidden">
          <p className="font-medium">Your UNN profile didn&apos;t have much to import yet</p>
          <p className="mt-1 text-muted-foreground">
            That&apos;s normal — most profiles only have a name and title. Fill the sections in
            here and your CV is done; you can copy the details back to your{" "}
            <a
              href={`${process.env.NEXT_PUBLIC_HUB_URL ?? "https://app.unnhub.org"}/profile/edit`}
              className="text-primary underline"
            >
              UNN profile
            </a>{" "}
            afterwards so job applications pre-fill too.
          </p>
        </div>
      )}

      <ResumeEditor
        resumeId={resume.id}
        initial={content}
        verified={profile?.verification_status === "verified"}
      />
    </div>
  );
}
