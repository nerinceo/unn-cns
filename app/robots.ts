import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";

/**
 * Only /jobs is indexable. Everything else in CNS is members-only, and shared
 * resumes at /r/<token> must never be indexed — they are private documents that
 * happen to be reachable by link.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/jobs", "/jobs/"],
        disallow: ["/", "/r/", "/api/", "/employer", "/resume", "/question-bank", "/revision", "/learn", "/library", "/progress"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
