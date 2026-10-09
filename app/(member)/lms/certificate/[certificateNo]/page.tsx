import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getMyCertificate } from "@/lib/cns/lms";
import { certificateVerifyUrl } from "@/lib/lms/certificate";
import { CertificateDocument } from "@/components/lms/CertificateDocument";
import { CertificateActions } from "@/components/lms/CertificateActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate — Central Nerusalem Space" };

/** The learner's own certificate. Issued by the database; only read here. */
export default async function MyCertificatePage({
  params,
}: {
  params: Promise<{ certificateNo: string }>;
}) {
  const { certificateNo } = await params;
  const cert = await getMyCertificate(certificateNo);
  if (!cert) notFound();

  const verifyUrl = certificateVerifyUrl(cert.verification_code);

  return (
    <div className="space-y-5">
      <Link
        href={cert.course ? `/lms/${cert.course.slug}` : "/lms"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {cert.course_title}
      </Link>

      {cert.revoked_at ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This certificate was revoked because the course enrolment was refunded or removed.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            Anyone with the verification link can confirm this certificate is genuine — no account needed. Share
            it with an employer or attach it to an application.
          </p>
          <CertificateActions verifyUrl={verifyUrl} />
        </div>
      )}

      <CertificateDocument
        learnerName={cert.learner_name}
        courseTitle={cert.course_title}
        instructorName={cert.instructor_name}
        contactHours={cert.contact_hours}
        issuedAt={cert.issued_at}
        certificateNo={cert.certificate_no}
        verificationCode={cert.verification_code}
      />
    </div>
  );
}
