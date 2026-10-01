import Link from "next/link";
import Image from "next/image";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { PortalSwitcher } from "./PortalSwitcher";
import { Rail, BottomNav, type PortalKey } from "./Rail";

/**
 * One shell, every portal — and the same shell as HUB.
 *
 * CNS used to have its own chrome: a top-nav bar for members, a boxed sidebar
 * for the consoles, a grey-blue canvas with floating cards. Crossing from
 * unn.nerusalem.com felt like leaving the product. This is HUB's frame instead
 * (unn-platform/app/(platform)/layout.tsx): a full-bleed frosted header, a rail
 * flush to the viewport edge, a flat white canvas, and a bottom tab bar below
 * lg. Only the nav and the section title change between portals.
 *
 * `unn-app` switches on HUB's surface layer in globals.css (flat cards, rail
 * edge, frosted header, nav-item accent, focus ring). The header must stay a
 * DIRECT child of it — the frosted treatment is `.unn-app > header`.
 *
 * Access is enforced by each route group's layout, not here — this only
 * renders. Note what is NOT passed to the rail: the nav array itself. Its
 * items carry Lucide icons, which cannot cross the server/client boundary.
 */
export async function AppShell({
  portal,
  employerId,
  wordmark,
  employers,
  isStaff,
  isInstructor,
  professional = false,
  children,
}: {
  portal: PortalKey;
  employerId?: string;
  wordmark: string;
  employers?: { id: string; name: string }[];
  isStaff?: boolean;
  isInstructor?: boolean;
  /** A 'uhn'-scoped viewer: job board only, and their account lives in HUB /pro. */
  professional?: boolean;
  children: React.ReactNode;
}) {
  const profile = await getCurrentUserProfile();
  const name = (profile?.full_name as string) ?? "Member";
  const photo = profile?.profile_photo as string | undefined;

  const homeHref =
    portal === "employer" && employerId
      ? `/employer/${employerId}`
      : portal === "admin"
        ? "/admin"
        : portal === "instructor"
          ? "/instructor"
          : "/";

  return (
    <div className="unn-app min-h-dvh bg-background">
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-white sm:h-16">
        <div className="flex h-full w-full items-center">
          {/* The logo slot is exactly the rail's width and carries the same
              edge, so the header divider and the rail's border are one
              continuous vertical line — as in HUB. Widths must match Rail. */}
          <div className="unn-rail-edge flex shrink-0 items-center px-4 lg:h-full lg:w-60 xl:w-64 2xl:w-72">
            <Link href={homeHref} className="flex items-center gap-2.5" aria-label={`${wordmark} home`}>
              {/* Background image, not <img>: the dark variant inverts it with
                  no second fetch and no theme-reading flash. Decorative — the
                  link's aria-label is the accessible name. */}
              <span
                aria-hidden
                className="block h-8 w-[110px] bg-[url('/nerusalem-wordmark.png')] bg-contain bg-left bg-no-repeat dark:brightness-0 dark:invert"
              />
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                CNS
              </span>
            </Link>
          </div>

          {/* Where HUB has search, CNS names the space you are in. */}
          <div className="hidden min-w-0 flex-1 items-center px-4 sm:flex lg:px-8">
            <span className="truncate text-base font-semibold tracking-[-0.011em] text-foreground">
              {wordmark}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 px-3 sm:px-4">
            {/* The switcher offers member/instructor/employer/admin portals. A
                professional holds none of those roles, and every destination in
                it would bounce them back out. */}
            {professional ? null : (
              <PortalSwitcher current={portal} employers={employers} isStaff={isStaff} isInstructor={isInstructor} />
            )}
            <a
              // HUB's /profile/me is a nurse route; a professional's account
              // lives at /pro, and middleware would redirect them there anyway.
              href={hubLink(professional ? "/pro" : "/profile/me")}
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-muted sm:pr-3"
              title={`${name} — open ${professional ? "your account" : "profile"} in Nerusalem`}
            >
              {photo ? (
                <Image
                  src={photo}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[12rem] truncate text-sm font-medium sm:inline">{name}</span>
            </a>
          </div>
        </div>
      </header>

      <div className="flex items-start">
        <Rail portal={portal} employerId={employerId} professional={professional} />

        <div className="min-w-0 flex-1">
          {/* Wide, but capped: past ~1600px a card grid stops gaining columns
              and starts gaining gutter. pb-28 clears the mobile bottom bar. */}
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-14 lg:pt-8 xl:px-10">
            {children}
          </main>
        </div>
      </div>

      <BottomNav portal={portal} employerId={employerId} professional={professional} />
    </div>
  );
}
