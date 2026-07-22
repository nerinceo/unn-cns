"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerEmployer } from "@/lib/actions/jobs";

const TYPES = [
  { v: "hospital", l: "Hospital" },
  { v: "clinic", l: "Clinic" },
  { v: "agency", l: "Recruitment agency" },
  { v: "university", l: "University / college" },
  { v: "other", l: "Other" },
];

export function EmployerRegisterForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    employer_type: "hospital",
    website: "",
    city: "",
    country: "India",
    description: "",
  });

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await registerEmployer(f);
          if ("error" in res && res.error) setError(res.error);
          else if ("id" in res) router.push(`/employer/${res.id}`);
        });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Organisation name</span>
        <Input required value={f.name} onChange={set("name")} placeholder="Apollo Hospitals, Bengaluru" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Type</span>
          <select
            value={f.employer_type}
            onChange={set("employer_type")}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Website</span>
          <Input value={f.website} onChange={set("website")} placeholder="https://…" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">City</span>
          <Input value={f.city} onChange={set("city")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Country</span>
          <Input value={f.country} onChange={set("country")} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">About the organisation</span>
        <textarea
          rows={3}
          value={f.description}
          onChange={set("description")}
          className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </label>

      <Button type="submit" disabled={pending || !f.name.trim()}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Register organisation"
        )}
      </Button>
      {error && <p className="text-sm text-secondary">{error}</p>}
    </form>
  );
}
