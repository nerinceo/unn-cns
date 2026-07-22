"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { saveSeekerProfile } from "@/lib/actions/seeker-profile";
import type { SeekerProfile } from "@/lib/cns/seeker";
import type { Category, TaxonomyKind } from "@/lib/cns/taxonomy";

export function SeekerProfileForm({
  initial,
  taxonomy,
}: {
  initial: SeekerProfile;
  taxonomy: Record<TaxonomyKind, Category[]>;
}) {
  const [p, setP] = useState<SeekerProfile>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback((next: SeekerProfile) => {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      await saveSeekerProfile(next);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    }, 800);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function set<K extends keyof SeekerProfile>(key: K, value: SeekerProfile[K]) {
    setP((prev) => {
      const next = { ...prev, [key]: value };
      schedule(next);
      return next;
    });
  }

  function toggleIn(key: keyof SeekerProfile, value: string) {
    const list = (p[key] as string[]) ?? [];
    set(key, (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]) as never);
  }

  return (
    <div className="space-y-6">
      <p className={cn("flex items-center gap-1.5 text-xs", state === "idle" ? "text-transparent" : "text-muted-foreground")}>
        {state === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : <><Check className="h-3 w-3" /> Saved</>}
      </p>

      <Section title="Your role">
        <Field label="Current nursing role">
          <Select value={p.nursing_role ?? ""} onChange={(v) => set("nursing_role", v || null)} options={taxonomy.nursing_role} placeholder="Select a role" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.is_student} onChange={(e) => set("is_student", e.target.checked)} />
          I am currently a nursing student
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Experience level">
            <Select value={p.experience_level ?? ""} onChange={(v) => set("experience_level", v || null)} options={taxonomy.experience_level} placeholder="Select" />
          </Field>
          <Field label="Total years of experience">
            <Input
              inputMode="decimal"
              value={p.total_years ?? ""}
              onChange={(e) => set("total_years", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </div>
        <Field label="Specialties" hint="Select every area you have worked in.">
          <Chips options={taxonomy.specialty} selected={p.specialties} onToggle={(v) => toggleIn("specialties", v)} />
        </Field>
      </Section>

      <Section title="Registration">
        {/* §15: the Basic Version must not claim UNN verifies professional
            licences. Saying so plainly is more honest than a quiet omission. */}
        <p className="flex gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          These details are shown to employers as you enter them. UNN does not verify professional
          licences — employers carry out their own checks.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Licence country">
            <Input value={p.licence_country ?? ""} onChange={(e) => set("licence_country", e.target.value)} />
          </Field>
          <Field label="Licence type">
            <Input value={p.licence_type ?? ""} onChange={(e) => set("licence_type", e.target.value)} placeholder="e.g. RN" />
          </Field>
          <Field label="Registration number">
            <Input value={p.licence_number ?? ""} onChange={(e) => set("licence_number", e.target.value)} />
          </Field>
          <Field label="Status">
            <Input value={p.licence_status ?? ""} onChange={(e) => set("licence_status", e.target.value)} placeholder="e.g. Active" />
          </Field>
        </div>
      </Section>

      <Section title="Education">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Highest qualification">
            <Input value={p.highest_qualification ?? ""} onChange={(e) => set("highest_qualification", e.target.value)} placeholder="B.Sc Nursing" />
          </Field>
          <Field label="Institution">
            <Input value={p.institution ?? ""} onChange={(e) => set("institution", e.target.value)} />
          </Field>
          <Field label="Year completed">
            <Input inputMode="numeric" value={p.graduation_year ?? ""} onChange={(e) => set("graduation_year", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
      </Section>

      <Section title="What you are looking for" hint="Used for job alerts and recommendations. Not shown to employers.">
        <Field label="Countries">
          <Chips options={taxonomy.country} selected={p.preferred_countries} onToggle={(v) => toggleIn("preferred_countries", v)} />
        </Field>
        <Field label="Roles">
          <Chips options={taxonomy.nursing_role} selected={p.preferred_roles} onToggle={(v) => toggleIn("preferred_roles", v)} />
        </Field>
        <Field label="Employment types">
          <Chips options={taxonomy.employment_type} selected={p.preferred_employment_types} onToggle={(v) => toggleIn("preferred_employment_types", v)} />
        </Field>
        <Field label="Work settings">
          <Chips options={taxonomy.work_setting} selected={p.preferred_work_settings} onToggle={(v) => toggleIn("preferred_work_settings", v)} />
        </Field>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

function Select({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Category[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Multi-select as toggle chips — far less fiddly than a multi-select box. */
function Chips({
  options, selected, onToggle,
}: {
  options: Category[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
