import type { MetadataRoute } from "next";
import { listPublishedJobs } from "@/lib/cns/jobs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.unnhub.org";

export const revalidate = 3600;

/**
 * Published jobs only.
 *
 * Expired listings are closed by cns_close_expired_jobs() and therefore drop
 * out of listPublishedJobs automatically — which matters, because a sitemap
 * full of stale job URLs is exactly what triggers a manual action removing
 * every job the site has.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const results = await listPublishedJobs().catch(() => []);

  return [
    { url: `${SITE}/jobs`, changeFrequency: "daily", priority: 0.9 },
    ...results.map(({ job }) => ({
      url: `${SITE}/jobs/${job.slug}`,
      lastModified: new Date(job.published_at ?? job.created_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
