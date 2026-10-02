import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getPublicResume } from "@/lib/cns/resume";
import { ResumeDocument } from "@/components/resume/ResumeDocument";

/**
 * Public resume share — deliberately OUTSIDE the members-only gate (see
 * PUBLIC_PATHS in middleware.ts), because the whole point is that a recruiter
 * with no UNN account can open it.
 *
 * Safe to expose because the lookup goes through a SECURITY DEFINER function
 * keyed on a 32-char random token, not through the table: an unknown or revoked
 * token returns nothing, and there is no way to enumerate other resumes.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const r = await getPublicResume(token);
  if (!r) return { title: "Resume not found" };
  return {
    title: `${r.authorName} — Resume`,
    description: r.content?.header?.headline ?? undefined,
    // A shared CV should never end up in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function PublicResumePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resume = await getPublicResume(token);
  if (!resume) notFound();

  return (
    <div className="min-h-screen bg-background py-8">
      {resume.verified && (
        <div className="mx-auto mb-4 flex max-w-[7.5in] items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm print:hidden">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong>{resume.authorName}</strong> is a verified member of the Unified Nerusalem Network.
            Identity and professional credentials were checked by Nerusalem.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[7.5in] overflow-hidden rounded-lg border border-border bg-card shadow-sm print:border-0 print:shadow-none">
        <ResumeDocument content={resume.content} verified={resume.verified} />
      </div>

      <p className="mx-auto mt-4 max-w-[7.5in] text-center text-xs text-muted-foreground print:hidden">
        Shared via Nerusalem · Last updated {new Date(resume.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
