"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Printer, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { ResumeDocument } from "./ResumeDocument";
import { updateResumeContent, reseedFromProfile } from "@/lib/actions/resume";
import type { ResumeContent } from "@/lib/cns/resume";

type SaveState = "idle" | "saving" | "saved";

export function ResumeEditor({
  resumeId,
  initial,
  verified,
}: {
  resumeId: string;
  initial: ResumeContent;
  verified: boolean;
}) {
  const [content, setContent] = useState<ResumeContent>(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [reseeding, setReseeding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave. Typing a CV is long-form work; an explicit Save button
  // is exactly the thing people forget before closing the tab.
  const scheduleSave = useCallback(
    (next: ResumeContent) => {
      if (timer.current) clearTimeout(timer.current);
      setSave("saving");
      timer.current = setTimeout(async () => {
        await updateResumeContent(resumeId, next);
        setSave("saved");
        setTimeout(() => setSave("idle"), 1600);
      }, 800);
    },
    [resumeId]
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function patch(fn: (draft: ResumeContent) => void) {
    setContent((prev) => {
      const next: ResumeContent = JSON.parse(JSON.stringify(prev));
      fn(next);
      scheduleSave(next);
      return next;
    });
  }

  async function doReseed() {
    setReseeding(true);
    await reseedFromProfile(resumeId);
    setReseeding(false);
    // Server action revalidates; reload to pick up the refreshed document.
    window.location.reload();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------------- editor ---------------- */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs",
              save === "idle" ? "text-transparent" : "text-muted-foreground"
            )}
          >
            {save === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            )}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={doReseed} disabled={reseeding}>
              {reseeding ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Re-import profile
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Download PDF
            </Button>
          </div>
        </div>

        {/* header ------------------------------------------------------- */}
        <Field label="Full name">
          <Input
            value={content.header.full_name}
            onChange={(e) => patch((d) => { d.header.full_name = e.target.value; })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline">
            <Input
              placeholder="Staff Nurse — Critical Care"
              value={content.header.headline ?? ""}
              onChange={(e) => patch((d) => { d.header.headline = e.target.value; })}
            />
          </Field>
          <Field label="Location">
            <Input
              value={content.header.location ?? ""}
              onChange={(e) => patch((d) => { d.header.location = e.target.value; })}
            />
          </Field>
          <Field label="Email">
            <Input
              value={content.header.email ?? ""}
              onChange={(e) => patch((d) => { d.header.email = e.target.value; })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={content.header.phone ?? ""}
              onChange={(e) => patch((d) => { d.header.phone = e.target.value; })}
            />
          </Field>
        </div>

        <Field label="Professional summary" hint="Two or three sentences. What you do, where, and what you are good at.">
          <textarea
            rows={4}
            className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
            value={content.summary ?? ""}
            onChange={(e) => patch((d) => { d.summary = e.target.value; })}
          />
        </Field>

        {/* registration -------------------------------------------------- */}
        <Repeater
          title="Professional registration"
          hint="Council registration is the first thing a nursing recruiter looks for."
          items={content.registration}
          onAdd={() => patch((d) => { d.registration.push({ council: "", number: "" }); })}
          onRemove={(i) => patch((d) => { d.registration.splice(i, 1); })}
          render={(r, i) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Council (e.g. Indian Nursing Council)" value={r.council}
                onChange={(e) => patch((d) => { d.registration[i].council = e.target.value; })} />
              <Input placeholder="Registration number" value={r.number}
                onChange={(e) => patch((d) => { d.registration[i].number = e.target.value; })} />
            </div>
          )}
        />

        {/* experience ---------------------------------------------------- */}
        <Repeater
          title="Work experience"
          items={content.experience}
          onAdd={() => patch((d) => { d.experience.unshift({ title: "", employer: "", bullets: [""] }); })}
          onRemove={(i) => patch((d) => { d.experience.splice(i, 1); })}
          render={(x, i) => (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Job title" value={x.title}
                  onChange={(e) => patch((d) => { d.experience[i].title = e.target.value; })} />
                <Input placeholder="Employer" value={x.employer}
                  onChange={(e) => patch((d) => { d.experience[i].employer = e.target.value; })} />
                {/* Four-digit years on purpose: some parsers choke on "'23". */}
                <Input placeholder="Start (e.g. 2023)" value={x.start ?? ""}
                  onChange={(e) => patch((d) => { d.experience[i].start = e.target.value; })} />
                <Input placeholder="End (or leave blank if current)" value={x.end ?? ""}
                  onChange={(e) => patch((d) => { d.experience[i].end = e.target.value; })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={Boolean(x.current)}
                  onChange={(e) => patch((d) => { d.experience[i].current = e.target.checked; })} />
                I currently work here
              </label>
              <textarea
                rows={3}
                placeholder="One achievement per line"
                className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                value={x.bullets.join("\n")}
                onChange={(e) => patch((d) => { d.experience[i].bullets = e.target.value.split("\n"); })}
              />
            </div>
          )}
        />

        {/* education ----------------------------------------------------- */}
        <Repeater
          title="Education"
          items={content.education}
          onAdd={() => patch((d) => { d.education.unshift({ degree: "", institution: "" }); })}
          onRemove={(i) => patch((d) => { d.education.splice(i, 1); })}
          render={(x, i) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Degree (e.g. B.Sc Nursing)" value={x.degree}
                onChange={(e) => patch((d) => { d.education[i].degree = e.target.value; })} />
              <Input placeholder="Institution" value={x.institution}
                onChange={(e) => patch((d) => { d.education[i].institution = e.target.value; })} />
              <Input placeholder="Start year" value={x.start ?? ""}
                onChange={(e) => patch((d) => { d.education[i].start = e.target.value; })} />
              <Input placeholder="End year" value={x.end ?? ""}
                onChange={(e) => patch((d) => { d.education[i].end = e.target.value; })} />
            </div>
          )}
        />

        {/* certifications ------------------------------------------------ */}
        <Repeater
          title="Certifications"
          items={content.certifications}
          onAdd={() => patch((d) => { d.certifications.push({ name: "" }); })}
          onRemove={(i) => patch((d) => { d.certifications.splice(i, 1); })}
          render={(x, i) => (
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Name (e.g. BLS)" value={x.name}
                onChange={(e) => patch((d) => { d.certifications[i].name = e.target.value; })} />
              <Input placeholder="Issuer" value={x.issuer ?? ""}
                onChange={(e) => patch((d) => { d.certifications[i].issuer = e.target.value; })} />
              <Input placeholder="Year" value={x.year ?? ""}
                onChange={(e) => patch((d) => { d.certifications[i].year = e.target.value; })} />
            </div>
          )}
        />

        <CommaField
          label="Clinical specialties"
          hint="ICU, Paediatrics, Theatre…"
          value={content.specialties}
          onChange={(v) => patch((d) => { d.specialties = v; })}
        />
        <CommaField
          label="Skills"
          value={content.skills}
          onChange={(v) => patch((d) => { d.skills = v; })}
        />
        <CommaField
          label="Languages"
          value={content.languages.map((l) => l.name)}
          onChange={(v) => patch((d) => { d.languages = v.map((name) => ({ name })); })}
        />
      </div>

      {/* ---------------- live preview ---------------- */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs text-muted-foreground print:hidden">
          Preview · single column, no tables or graphics, so applicant tracking systems read it
          correctly
        </p>
        <div className="overflow-hidden rounded-lg border border-border shadow-sm print:border-0 print:shadow-none">
          <ResumeDocument content={content} verified={verified} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Repeater<T>({
  title, hint, items, onAdd, onRemove, render,
}: {
  title: string;
  hint?: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            Nothing here yet.
          </p>
        )}
        {items.map((item, i) => (
          <div key={i} className="relative rounded-md border border-border bg-card p-3 pr-10">
            {render(item, i)}
            <button
              onClick={() => onRemove(i)}
              aria-label="Remove"
              className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground transition-colors hover:text-secondary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommaField({
  label, hint, value, onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Field label={label} hint={hint ?? "Separate with commas"}>
      <Input
        value={value.join(", ")}
        onChange={(e) =>
          onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      />
    </Field>
  );
}
