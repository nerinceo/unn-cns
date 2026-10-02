import Link from "next/link";
import { ClipboardList, Database } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content — Central Nerusalem Space Admin" };

/**
 * Question-bank content overview.
 *
 * Authoring screens are not built yet, so this reports what is in the database
 * and how to load more. Better an honest inventory than a dead nav link.
 */
export default async function AdminContentPage() {
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };

  const [institutions, subjects, topics, questions, sets] = await Promise.all([
    admin.from("cns_institutions").select("id", head),
    admin.from("cns_subjects").select("id", head),
    admin.from("cns_topics").select("id", head),
    admin.from("cns_questions").select("id", head),
    admin.from("cns_question_sets").select("id", head),
  ]).then((rs) => rs.map((r) => r.count ?? 0));

  const rows = [
    { label: "Institutions", value: institutions },
    { label: "Subjects", value: subjects },
    { label: "Topics", value: topics },
    { label: "Questions", value: questions },
    { label: "Question sets", value: sets },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Content</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          What is currently in the question bank.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-dashed border-border bg-card p-6">
        <p className="flex items-center gap-2 font-medium">
          <Database className="h-4 w-4" /> Authoring is not built yet
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Institutions, subjects, questions and sets are currently loaded by SQL migration.
          Screens for creating and editing them in place, plus a JSON/CSV importer writing to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">cns_import_batches</code>, are the
          next piece of admin work.
        </p>
        <Link href="/question-bank" className="mt-3 inline-block text-sm text-primary hover:underline">
          View the question bank as a member sees it
        </Link>
      </div>
    </div>
  );
}
