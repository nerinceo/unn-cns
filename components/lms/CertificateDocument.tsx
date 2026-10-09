import { Award } from "lucide-react";
import { certificateVerifyUrl, formatIssuedDate } from "@/lib/lms/certificate";

/**
 * The certificate itself. One component for the learner's page and the public
 * /verify page, so what an employer checks is exactly what the learner holds.
 *
 * Laid out for a landscape A4 / Letter page: the verify page's "Download PDF"
 * is the browser's print-to-PDF, and the print rules here make that a clean
 * single page (no app chrome, no shadow, exact colours).
 */
export function CertificateDocument({
  learnerName,
  courseTitle,
  instructorName,
  contactHours,
  issuedAt,
  certificateNo,
  verificationCode,
}: {
  learnerName: string;
  courseTitle: string;
  instructorName: string | null;
  contactHours: number | null;
  issuedAt: string;
  certificateNo: string;
  verificationCode: string | null;
}) {
  return (
    <div className="certificate-page mx-auto aspect-[1.414/1] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-white text-slate-900 shadow-sm [print-color-adjust:exact] print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <div className="flex h-full flex-col border-[10px] border-primary/15 p-[5%]">
        <div className="flex items-center justify-between">
          <p className="text-lg font-black uppercase tracking-[0.25em] text-primary sm:text-xl">Nerusalem</p>
          <Award className="h-8 w-8 text-primary sm:h-10 sm:w-10" aria-hidden />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 sm:text-xs">
            Certificate of completion
          </p>
          <p className="mt-4 text-xs text-slate-500 sm:mt-6 sm:text-sm">This certifies that</p>
          <p className="mt-2 text-2xl font-semibold sm:text-4xl">{learnerName}</p>
          <p className="mt-4 text-xs text-slate-500 sm:mt-6 sm:text-sm">has completed the course</p>
          <p className="mt-2 max-w-[85%] text-base font-semibold sm:text-2xl">{courseTitle}</p>
          <p className="mt-3 text-xs text-slate-600 sm:text-sm">
            and passed the final exam
            {contactHours ? ` · ${contactHours} contact hour${contactHours === 1 ? "" : "s"}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-600 sm:grid-cols-3 sm:text-xs">
          <div>
            <p className="font-semibold text-slate-900">{instructorName ?? "Nerusalem instructor"}</p>
            <p>Instructor</p>
          </div>
          <div className="text-right sm:text-center">
            <p className="font-semibold text-slate-900">{formatIssuedDate(issuedAt)}</p>
            <p>Date issued</p>
          </div>
          <div className="col-span-2 sm:col-span-1 sm:text-right">
            <p className="font-semibold text-slate-900">{certificateNo}</p>
            {verificationCode && <p className="break-all">Verify at {certificateVerifyUrl(verificationCode)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
