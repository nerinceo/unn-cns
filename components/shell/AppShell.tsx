import Link from "next/link";
import Image from "next/image";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { PortalSwitcher } from "./PortalSwitcher";
import { HeaderNav, BottomNav, type PortalKey } from "./ShellNav";

/**
 * One shell, every portal, in HUB's visual language.
 *
 * HUB's surfaces (unn-platform/app/(platform)/layout.tsx): frosted header,
 * flat white canvas, flat bordered cards, its type scale and focus ring — so
 * crossing from unn.nerusalem.com does not feel like leaving the product. NOT
 * HUB's rail: CNS has a short nav and no sidebar (product decision,
 * 2026-10-01), so the nav sits inline in the header on desktop and in a bottom
 * tab bar below lg. Only the nav and the section title change between portals.
 *
 * `unn-app` switches on HUB's surface layer in globals.css. The header must
 * stay a DIRECT child of it — the frosted treatment is `.unn-app > header`.
 *
 * Access is enforced by each route group's layout, not here — this only
 * renders. Note what is NOT passed to the nav: the nav array itself. Its
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
      <header className="sticky top-0 z-50 h-16 border-b border-border bg-white">
        {/* Same container as <main>, so the logo sits on the content's left
            edge and the account chip on its right. */}
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8 xl:px-10">
          <Link href={homeHref} className="flex shrink-0 items-center gap-2.5" aria-label={`${wordmark} home`}>
            {/* The full mark — crest and NERUSALEM — exactly as HUB's brand
                file has it (public/nerusalem-logo.png, 2740×380, ≈7.2:1).
                The box carries that ratio so it never letterboxes. Decorative:
                the link's aria-label is the accessible name. */}
            <span
              aria-hidden
              className="block h-6 w-[173px] bg-[url('/nerusalem-logo.png')] bg-contain bg-left bg-no-repeat sm:h-7 sm:w-[202px]"
            />
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              CNS
            </span>
          </Link>

          {/* The consoles name the organisation you are acting for; the member
              portal does not need a title beside its own logo. */}
          {portal === "member" ? null : (
            <span className="hidden min-w-0 truncate border-l border-border pl-4 text-base font-semibold text-foreground sm:inline">
              {wordmark}
            </span>
          )}

          <HeaderNav portal={portal} employerId={employerId} professional={professional} />

          <div className="ml-auto flex shrink-0 items-center gap-2">
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
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-muted xl:pr-3"
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
              {/* xl, not sm: at lg the inline nav needs the room. */}
              <span className="hidden max-w-[12rem] truncate text-sm font-medium xl:inline">{name}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Wide, but capped: past ~1600px a card grid stops gaining columns and
          starts gaining gutter. pb-28 clears the mobile bottom bar. */}
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-14 lg:pt-8 xl:px-10">
        {children}
      </main>

      <BottomNav portal={portal} employerId={employerId} professional={professional} />
    </div>
  );
}
