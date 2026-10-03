"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Trash2, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadResume, deleteResumeFile, getResumeDownloadUrl } from "@/lib/actions/resume-files";
import { settle } from "@/lib/utils/settle";

export type ResumeFile = {
  id: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
};

/**
 * Uploaded CV, alongside the structured builder.
 *
 * Both exist deliberately: measured on production, 94 of 96 profiles had no
 * experience data, so upload-only would block most nurses from applying, and
 * builder-only would stop anyone with a polished CV from using it.
 */
export function ResumeUpload({ current }: { current: ResumeFile | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(file: File) {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    start(async () => {
      const res = await settle(uploadResume(form));
      if (res?.error) setError(res.error);
      else router.refresh();
      if (input.current) input.current.value = "";
    });
  }

  async function download(id: string) {
    const res = await settle(getResumeDownloadUrl(id));
    if ("url" in res && res.url) window.open(res.url, "_blank", "noopener");
    else setError("error" in res ? res.error! : "Could not open that file.");
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-medium">Upload a CV</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        PDF or Word, up to 5 MB. Employers see this only when you apply to their role.
      </p>

      {current ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{current.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {(current.size_bytes / 1024).toFixed(0)} KB · uploaded{" "}
              {new Date(current.created_at).toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => download(current.id)}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await settle(deleteResumeFile(current.id));
                if (res?.error) setError(res.error);
                else router.refresh();
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No CV uploaded yet.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />

      <Button
        variant="outline"
        className="mt-4"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" /> {current ? "Replace CV" : "Choose file"}
          </>
        )}
      </Button>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        Stored privately. Links expire after ten minutes and are never public.
      </p>

      {error && <p className="mt-2 text-sm text-secondary">{error}</p>}
    </div>
  );
}
