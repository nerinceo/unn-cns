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
