"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveJob, submitJobForReview } from "@/lib/actions/jobs";
import { settle } from "@/lib/utils/settle";

/** One vocabulary, passed in from the server — see JobComposer's note. */
export type Option = { value: string; label: string };
export type JobOptions = {
  employment_type: Option[];
  nursing_role: Option[];
  specialty: Option[];
  work_setting: Option[];
  experience_level: Option[];
  country: Option[];
};

/**
 * Job composer.
 *
 * The field set and the inline guidance are shaped by what Google for Jobs
 * requires — a thin description or a missing deadline is not a style problem,
 * it makes the listing ineligible and, at scale, risks the whole board being
 * delisted. submitJobForReview() enforces the same rules server-side.
 *
 * Every controlled field is driven by `options`, read from cns_job_categories
 * by the page that renders this. They were hardcoded here once, and when the
 * database vocabulary moved to the blueprint's lists the two silently drifted:
 * choosing "Locum" produced a raw check-constraint error and no job. Anything
 * the database constrains must come from the same place the database does.
 */
export type JobDraft = Partial<Record<string, unknown>> & { id?: string };

export function JobComposer({
  employerId,
  canPublish,
  options,
  existing,
}: {
  employerId: string;
  canPublish: boolean;
  options: JobOptions;
  /** Pass a job to edit it in place; omit to create a new one. */
  existing?: JobDraft;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(existing?.id);
  const str = (k: string, fallback = "") =>
    existing?.[k] === null || existing?.[k] === undefined ? fallback : String(existing[k]);

  // Default to the first option rather than a literal, so a vocabulary change
  // can never leave the form pre-set to a value the database will reject.
  const first = (k: keyof JobOptions) => options[k][0]?.value ?? "";

  const [f, setF] = useState({
    title: str("title"),
    description: str("description"),
    responsibilities: str("responsibilities"),
    qualifications: str("qualifications"),
    employment_type: str("employment_type", first("employment_type")),
    nursing_role: str("nursing_role", first("nursing_role")),
    specialty: str("specialty", first("specialty")),
    work_setting: str("work_setting", first("work_setting")),
    experience_level: str("experience_level", first("experience_level")),
    is_remote: Boolean(existing?.is_remote),
    visa_sponsorship: Boolean(existing?.visa_sponsorship),
    country: str("country", first("country")),
    state: str("state"),
    city: str("city"),
    experience_min_years: str("experience_min_years"),
    license_required: existing?.license_required !== false,
    salary_min: str("salary_min"),
    salary_max: str("salary_max"),
    salary_currency: str("salary_currency", "INR"),
    salary_period: str("salary_period", "MONTH"),
    salary_undisclosed: Boolean(existing?.salary_undisclosed),
    vacancies: str("vacancies", "1"),
    application_deadline: str("application_deadline"),
  });

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function submit(publish: boolean) {
    setError(null);
    start(async () => {
      const payload = {
        ...f,
        // work_mode predates work_setting and still carries a NOT NULL default;
        // keep it consistent with the remote flag rather than leaving it stale.
        work_mode: f.is_remote ? "remote" : "onsite",
        experience_min_years: f.experience_min_years ? Number(f.experience_min_years) : null,
        salary_min: f.salary_min ? Number(f.salary_min) : null,
        salary_max: f.salary_max ? Number(f.salary_max) : null,
        vacancies: Number(f.vacancies) || 1,
        application_deadline: f.application_deadline || null,
      };
      const res = await settle(saveJob(employerId, payload, existing?.id));
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (publish && "id" in res && res.id) {
        const sub = await settle(submitJobForReview(res.id));
        if (sub?.error) {
          setError(sub.error);
          return;
        }
      }
      if (isEdit) {
        // Editing: stay put and let the saved values persist rather than
        // clearing the form out from under the person.
        router.refresh();
      } else {
        router.refresh();
        setF((p) => ({ ...p, title: "", description: "", responsibilities: "", qualifications: "" }));
      }
    });
  }

  const descTooShort = f.description.trim().length > 0 && f.description.trim().length < 100;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Job title</span>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          The role only — no location, salary or organisation name.
        </span>
        <Input value={f.title} onChange={set("title")} placeholder="Staff Nurse — Intensive Care" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Description</span>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          What the role involves. A full description is required for the listing to appear in
          Google&apos;s job search.
        </span>
        <textarea
          rows={5}
          value={f.description}
          onChange={set("description")}
          className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
        {descTooShort && (
          <span className="mt-1 flex items-center gap-1 text-xs text-secondary">
            <Info className="h-3 w-3" /> {100 - f.description.trim().length} more characters needed
          </span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Responsibilities</span>
          <textarea rows={3} value={f.responsibilities} onChange={set("responsibilities")}
            className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Qualifications</span>
          <textarea rows={3} value={f.qualifications} onChange={set("qualifications")}
            className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Nursing role" value={f.nursing_role}
                onChange={set("nursing_role")} options={options.nursing_role} />
        <Select label="Specialty" value={f.specialty}
                onChange={set("specialty")} options={options.specialty} />
        <Select label="Employment type" value={f.employment_type}
                onChange={set("employment_type")} options={options.employment_type} />
        <Select label="Work setting" value={f.work_setting}
                onChange={set("work_setting")} options={options.work_setting} />
        <Select label="Experience required" value={f.experience_level}
                onChange={set("experience_level")} options={options.experience_level} />
        <Select label="Country" value={f.country}
                onChange={set("country")} options={options.country} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">City</span>
          <Input value={f.city} onChange={set("city")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">State</span>
          <Input value={f.state} onChange={set("state")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Salary from</span>
          <Input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Salary to</span>
          <Input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Per</span>
          <select value={f.salary_period} onChange={set("salary_period")}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">
            {["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].map((p) => (
              <option key={p} value={p}>{p.toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Minimum experience (years)</span>
          <Input value={f.experience_min_years} onChange={set("experience_min_years")} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Vacancies</span>
          <Input value={f.vacancies} onChange={set("vacancies")} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Applications close</span>
          <span className="mb-1.5 block text-xs text-muted-foreground">Required to publish.</span>
          <Input type="date" value={f.application_deadline} onChange={set("application_deadline")} />
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.license_required}
            onChange={(e) => setF((p) => ({ ...p, license_required: e.target.checked }))} />
          Nursing council registration required
        </label>
        {/* Separate from work setting on purpose: the blueprint treats where
            the work happens (hospital, clinic, home care) and whether it is
            remote as two different questions. A telehealth role is remote; a
            hospital role generally is not. */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_remote}
            onChange={(e) => setF((p) => ({ ...p, is_remote: e.target.checked }))} />
          Remote or telehealth
        </label>
        {/* The decisive fact for an internationally educated nurse, and until
            now not capturable at all — a ward job that will sponsor and one
            that will not looked identical until the interview. Filterable on
            the board, so saying yes is what puts this role in front of them. */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.visa_sponsorship}
            onChange={(e) => setF((p) => ({ ...p, visa_sponsorship: e.target.checked }))} />
          Visa sponsorship available
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={() => submit(false)} disabled={pending || !f.title.trim()}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isEdit ? "Save changes" : "Save draft"}
        </Button>
        <Button onClick={() => submit(true)} disabled={pending || !canPublish || !f.title.trim()}>
          {isEdit ? "Save & submit" : "Submit for review"}
        </Button>
        {!canPublish && (
          <span className="text-xs text-muted-foreground">
            Submitting unlocks once Nerusalem approves your organisation.
          </span>
        )}
      </div>
      {error && <p className="text-sm text-secondary">{error}</p>}
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  options: Option[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
