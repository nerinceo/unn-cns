"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { saveJobAlert, turnOffJobAlert } from "@/lib/actions/jobs";
import { settle } from "@/lib/utils/settle";

type Option = { value: string; label: string };

/**
 * The member's job alert: a once-a-day email (and notification) when new roles
 * match the countries and roles chosen here. One alert per member.
 */
export function JobAlertForm({
  countries,
  roles,
  initial,
}: {
  countries: Option[];
  roles: Option[];
  initial: { countries: string[]; roles: string[]; active: boolean } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState({
    countries: initial?.countries ?? [],
    roles: initial?.roles ?? [],
  });
  const [active, setActive] = useState(Boolean(initial?.active));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (k: "countries" | "roles", v: string) =>
    setPicked((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  function save() {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await settle(saveJobAlert(picked));
      if (res?.error) return setError(res.error);
      setActive(true);
      setNotice("Alert saved. We will email you once a day when new roles match.");
      router.refresh();
    });
  }

  function off() {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await settle(turnOffJobAlert());
      if (res?.error) return setError(res.error);
      setActive(false);
      setNotice("Alert turned off.");
      router.refresh();
    });
  }

  return (
    <section id="alerts" className="scroll-mt-24 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <BellRing className="h-4 w-4 text-primary" /> Job alert
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A daily email when new roles match. Choose up to 8 countries and 8 roles.
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {active ? "On" : "Off"}
        </span>
      </div>

      <Chips label="Countries" options={countries} picked={picked.countries} onToggle={(v) => toggle("countries", v)} />
      <Chips label="Roles" options={roles} picked={picked.roles} onToggle={(v) => toggle("roles", v)} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {active ? "Update alert" : "Turn on alert"}
        </Button>
        {active && (
          <Button variant="outline" onClick={off} disabled={pending}>
            Turn off
          </Button>
        )}
      </div>
      {notice && <p className="mt-2 text-sm text-primary">{notice}</p>}
      {error && <p className="mt-2 text-sm text-secondary">{error}</p>}
    </section>
  );
}

function Chips({
  label,
  options,
  picked,
  onToggle,
}: {
  label: string;
  options: Option[];
  picked: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
