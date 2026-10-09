"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settle } from "@/lib/utils/settle";
import {
  addManualJob, createJobSource, deleteJobSource, runJobSourceNow, setJobSourceFlags,
} from "@/lib/actions/admin-job-sources";

const field =
  "h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:border-primary";

type Country = { iso: string; label: string };

/* ------------------------------------------------------------ row actions */

export function JobSourceRowActions({
  sourceId, enabled, autoPublish,
}: {
  sourceId: string;
  enabled: boolean;
  autoPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function act(fn: () => Promise<{ error?: string } & Record<string, unknown>>, done: (r: Record<string, unknown>) => string) {
    start(async () => {
      setMsg(null);
      const res = await settle(fn());
      if (res?.error) setMsg({ tone: "err", text: res.error });
      else setMsg({ tone: "ok", text: done(res ?? {}) });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(() => runJobSourceNow(sourceId), (r) => {
              const s = r.stats as { fetched: number; inserted: number; updated: number; skipped: number; closed: number };
              return `Fetched ${s.fetched} · new ${s.inserted} · updated ${s.updated} · skipped ${s.skipped} · closed ${s.closed}`;
            })
          }
        >
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Run now
        </Button>
        <Button
          size="sm"
          variant={enabled ? "ghost" : "default"}
          disabled={pending}
          onClick={() =>
            act(() => setJobSourceFlags(sourceId, { enabled: !enabled }), (r) =>
              enabled ? `Turned off. ${Number(r.closed ?? 0)} live roles closed.` : "Turned on. It runs four times a day."
            )
          }
        >
          <Power className="mr-1.5 h-3.5 w-3.5" />
          {enabled ? "Turn off" : "Turn on"}
        </Button>
        {!confirmDelete ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(true)} aria-label="Delete source">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => act(() => deleteJobSource(sourceId), () => "Deleted.")}
          >
            Delete and close its roles
          </Button>
        )}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={autoPublish}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            act(() => setJobSourceFlags(sourceId, { autoPublish: next }), () =>
              next ? "New roles go live automatically." : "New roles wait in Job approvals."
            );
          }}
        />
        Publish new roles automatically
      </label>
      {msg && (
        <p className={`max-w-xs text-right text-xs ${msg.tone === "err" ? "text-secondary" : "text-muted-foreground"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- new source */

export function NewJobSourceForm({ countries }: { countries: Country[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("jooble");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await settle(createJobSource(fd));
          if (res?.error) setError(res.error);
          else router.refresh();
        })
      }
    >
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium">Source</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="jooble">Jooble (job search API)</option>
          <option value="adzuna">Adzuna (job search API)</option>
          <option value="greenhouse">Hospital careers board on Greenhouse</option>
          <option value="lever">Hospital careers board on Lever</option>
        </select>
      </label>

      {kind === "adzuna" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Country</span>
          <select name="adzunaCountry" className={field} defaultValue="in">
            <option value="in">India</option>
            <option value="gb">United Kingdom</option>
            <option value="us">United States</option>
            <option value="au">Australia</option>
            <option value="ca">Canada</option>
            <option value="nz">New Zealand</option>
            <option value="de">Germany</option>
            <option value="sg">Singapore</option>
            <option value="ch">Switzerland</option>
          </select>
        </label>
      )}

      {kind !== "adzuna" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Country</span>
          <select name="country" className={field} defaultValue="IN">
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>{c.label}</option>
            ))}
          </select>
        </label>
      )}

      {(kind === "adzuna" || kind === "jooble") && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Keywords</span>
            <input name="keywords" placeholder="nurse" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">City or region (optional)</span>
            <input name="location" placeholder={kind === "jooble" ? "Dubai" : "Bangalore"} className={field} />
          </label>
        </>
      )}

      {(kind === "greenhouse" || kind === "lever") && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Hospital name</span>
            <input name="company" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">
              {kind === "greenhouse" ? "Board token" : "Site name"}
            </span>
            <input
              name="handle"
              placeholder={kind === "greenhouse" ? "from boards.greenhouse.io/<token>" : "from jobs.lever.co/<name>"}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            <input type="checkbox" name="allJobs" />
            Import every role on this board, not only nursing and healthcare titles
          </label>
          {kind === "lever" && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <input type="checkbox" name="eu" />
              Board is hosted on Lever EU (jobs.eu.lever.co)
            </label>
          )}
        </>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium">Most roles per run</span>
        <input name="maxPerRun" type="number" min={1} max={500} defaultValue={100} className={field} />
      </label>

      <div className="flex items-end gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Add source
        </Button>
        <span className="text-xs text-muted-foreground">It starts switched off. Use Run now to check it first.</span>
      </div>
      {error && <p className="text-sm text-secondary sm:col-span-2">{error}</p>}
    </form>
  );
}

/* -------------------------------------------------------------- manual job */

export function ManualJobForm({ countries }: { countries: Country[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <form
      key={formKey}
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          setError(null);
          setSaved(false);
          const res = await settle(addManualJob(fd));
          if (res?.error) setError(res.error);
          else {
            setSaved(true);
            setFormKey((k) => k + 1);
            router.refresh();
          }
        })
      }
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Job title</span>
        <input name="title" required className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Hospital / employer</span>
        <input name="company" required className={field} />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium">Apply link (the original posting)</span>
        <input name="applyUrl" type="url" required placeholder="https://" className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">City</span>
        <input name="city" className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Country</span>
        <select name="country" className={field} defaultValue="IN">
          {countries.map((c) => (
            <option key={c.iso} value={c.iso}>{c.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Employment type</span>
        <select name="employmentType" className={field} defaultValue="full-time">
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="temporary">Temporary</option>
          <option value="permanent">Permanent</option>
          <option value="casual">Casual</option>
          <option value="internship">Internship</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Closing date (optional)</span>
        <input name="deadline" type="date" className={field} />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium">Description</span>
        <textarea
          name="description"
          required
          rows={5}
          className="w-full rounded-md border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Publish role
        </Button>
        {saved && <span className="text-xs text-primary">Published to the job board.</span>}
        {error && <span className="text-xs text-secondary">{error}</span>}
      </div>
    </form>
  );
}
