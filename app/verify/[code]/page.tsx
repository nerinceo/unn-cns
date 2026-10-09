import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { verifyCertificate } from "@/lib/cns/lms";
import { CertificateDocument } from "@/components/lms/CertificateDocument";
import { PrintCertificate } from "@/components/lms/CertificateActions";

/**
 * Public certificate check — deliberately OUTSIDE the members-only gate (see
 * PUBLIC_PATHS in middleware.ts): an employer or a nursing council confirms a
 * certificate here without a Nerusalem account.
 *
 * Safe to expose for the same reasons as /r/: the lookup is a SECURITY DEFINER
 * function keyed on a 32-hex random code, it returns only what is printed on
 * the certificate, an unknown code returns nothing, and nothing is enumerable.
 * Also the printable copy — "Download PDF" is the browser's print-to-PDF.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const cert = await verifyCertificate(code);
  return {
    title: cert ? `${cert.learner_name} — ${cert.course_title} certificate` : "Certificate not found",
    // A certificate names a person: never in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function VerifyCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ code }, { print }] = await Promise.all([params, searchParams]);
  const cert = await verifyCertificate(code);
  if (!cert) notFound();

  return (
    <div className="min-h-screen bg-background px-4 py-8 print:p-0">
      {/* Landscape, edge to edge — scoped to this page so the resume print stays portrait. */}
      <style>{"@page { size: A4 landscape; margin: 8mm; }"}</style>

      <div className="mx-auto mb-4 max-w-4xl print:hidden">
        {cert.revoked ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>This certificate has been revoked</strong> and is no longer valid.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="flex items-start gap-2 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Valid certificate.</strong> Issued by Nerusalem to {cert.learner_name} for completing
                this course and passing its final exam.
              </span>
            </p>
            <PrintCertificate autoPrint={print === "1"} />
          </div>
        )}
      </div>

      {!cert.revoked && (
        <CertificateDocument
          learnerName={cert.learner_name}
          courseTitle={cert.course_title}
          instructorName={cert.instructor_name}
          contactHours={cert.contact_hours}
          issuedAt={cert.issued_at}
          certificateNo={cert.certificate_no}
          verificationCode={code}
        />
      )}
    </div>
  );
}
