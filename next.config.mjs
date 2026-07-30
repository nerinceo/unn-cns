/** @type {import('next').NextConfig} */

// Media host for question/lesson images, mirroring the HUB config.
const r2Host = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : undefined;

const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-avatar", "@radix-ui/react-tabs"],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    remotePatterns: [
      // Profile photos still live on the HUB media hosts — CNS renders the
      // same public.users rows, so it must be allowed to display them.
      {
        protocol: "https",
        hostname: "zldqlhthrzlvygnesbqg.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      ...(r2Host ? [{ protocol: "https", hostname: r2Host, pathname: "/**" }] : []),
    ],
  },
  async redirects() {
    // The bank is now university → format → subject. Two earlier shapes point
    // at it: the original top-level /revision, and the brief flat
    // /question-bank/{mcq,revision} that preceded the university level.
    //
    // A subject id does not name its university, so subject deep links go
    // through /question-bank/subject/:id, which looks the owner up and
    // forwards. Permanent, so a bookmark follows once and stops asking.
    return [
      { source: "/revision", destination: "/question-bank", permanent: true },
      { source: "/revision/:subjectId", destination: "/question-bank/subject/:subjectId", permanent: true },
      { source: "/question-bank/mcq", destination: "/question-bank", permanent: true },
      { source: "/question-bank/revision", destination: "/question-bank", permanent: true },
      {
        source: "/question-bank/revision/:subjectId",
        destination: "/question-bank/subject/:subjectId",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
