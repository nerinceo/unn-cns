import type { MetadataRoute } from "next";
import { listAllActiveJobsForSitemap } from "@/lib/cns/jobs";
import { createClient } from "@/lib/supabase/server";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";

export const revalidate = 3600;

/**
 * Published jobs only.
 *
 * Expired listings are closed by cns_close_expired_jobs() and therefore drop
 * out of the active set automatically — which matters, because a sitemap
 * full of stale job URLs is exactly what triggers a manual action removing
 * every job the site has.
 *
 * Uses the paging reader, not the board query: the board caps a page at 100
 * rows, and a sitemap that silently stops at the cap is worse than useless —
 * it tells Google those are the only jobs that exist.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [jobs, employers] = await Promise.all([
    listAllActiveJobsForSitemap().catch(() => []),
    listApprovedEmployers().catch(() => []),
  ]);

  return [
    { url: `${SITE}/jobs`, changeFrequency: "daily", priority: 0.9 },
    ...jobs.map((job) => ({
      url: `${SITE}/jobs/${job.slug}`,
      lastModified: new Date(job.published_at ?? job.created_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // Employer pages change far less often than the roles on them, and rank
    // for a different query — the hospital's own name.
    ...employers.map((e) => ({
      url: `${SITE}/employers/${e.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

/** Approved employers only — the same gate /employers/[slug] applies. */
async function listApprovedEmployers(): Promise<{ slug: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_employers")
    .select("slug")
    .eq("status", "approved")
    .limit(5000);
  return (data ?? []) as { slug: string }[];
}
