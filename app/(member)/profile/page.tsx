import { UserRound } from "lucide-react";
import { createClient, getCurrentUserProfile, getCurrentUser } from "@/lib/supabase/server";
import { getTaxonomy } from "@/lib/cns/taxonomy";
import { EMPTY_SEEKER, profileCompleteness, type SeekerProfile } from "@/lib/cns/seeker";
import { SeekerProfileForm } from "@/components/jobs/SeekerProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job Profile — Central Nursing Systems" };

export default async function JobProfilePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: row }, { data: resume }, hubProfile, taxonomy] = await Promise.all([
    supabase
      .from("cns_job_seeker_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("cns_resume_files")
      .select("id")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .maybeSingle(),
    getCurrentUserProfile(),
    getTaxonomy(),
  ]);

  const profile: SeekerProfile = { ...EMPTY_SEEKER, ...(row ?? {}) };
  const completeness = profileCompleteness(
    profile,
    Boolean(resume),
    Boolean(hubProfile?.full_name)
  );

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <UserRound className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">Job Profile</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          What employers see when you apply. Your name, photo and verification come from your UNN
          account — everything here is specific to job hunting.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">Profile completeness</p>
          <p className="text-sm font-semibold tabular-nums text-primary">
            {completeness.percent}%
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={completeness.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
        {completeness.missing.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Still to add: {completeness.missing.join(", ")}
          </p>
        )}
      </section>

      <SeekerProfileForm initial={profile} taxonomy={taxonomy} />
    </div>
  );
}
