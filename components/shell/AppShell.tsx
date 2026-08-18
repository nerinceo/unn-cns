import Link from "next/link";
import Image from "next/image";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { cn } from "@/lib/utils/cn";
import { PortalSwitcher } from "./PortalSwitcher";
import { SideNav, MobileNav, type PortalKey } from "./SideNav";
import { MemberTopNav, MemberBottomNav } from "./MemberNav";

/**
 * One shell, three portals.
 *
 * Chrome is identical everywhere so the product still feels like one thing;
 * only the nav and the wordmark change. Access is enforced by each route
 * group's layout, not here — this only renders.
 *
 * Note what is NOT passed: the nav array itself. Its items carry Lucide icons,
 * which are functions and cannot cross the server/client boundary. SideNav
 * receives a portal key instead and resolves the nav on the client.
 */
export async function AppShell({
  portal,
  employerId,
  wordmark,
  employers,
  isStaff,
  isInstructor,
  children,
}: {
  portal: PortalKey;
  employerId?: string;
  wordmark: string;
  employers?: { id: string; name: string }[];
  isStaff?: boolean;
  isInstructor?: boolean;
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

  // The member portal is the CNS learning/careers experience: a wide top-nav
  // layout (1280–1440px) per the brief. Employer and admin keep the compact
  // sidebar — they are task consoles, not a browse experience.
  const isMember = portal === "member";
  const container = isMember ? "max-w-[1440px] px-6" : "max-w-6xl px-4";

  return (
    <>
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-card">
        <div className={cn("mx-auto flex h-full items-center gap-4", container)}>
          <Link href={homeHref} className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">
              CNS
            </span>
            <span className="hidden truncate text-lg font-semibold text-primary sm:inline">
              {wordmark}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <PortalSwitcher current={portal} employers={employers} isStaff={isStaff} isInstructor={isInstructor} />
            <a
              href={hubLink("/profile/me")}
              className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-muted"
              title={`${name} — open profile in UNN Hub`}
            >
              {photo ? (
                <Image
                  src={photo}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="hidden text-sm font-medium sm:inline">{name}</span>
            </a>
          </div>
        </div>
      </header>

      {isMember ? (
        <>
          <MemberTopNav />
          <div className={cn("mx-auto pb-24 pt-6 md:pb-10", container)}>
            <main className="min-w-0">{children}</main>
          </div>
          <MemberBottomNav />
        </>
      ) : (
        <>
          <div className={cn("mx-auto flex gap-8 pb-24 pt-6 md:pb-8", container)}>
            <SideNav portal={portal} employerId={employerId} />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
          <MobileNav portal={portal} employerId={employerId} />
        </>
      )}
    </>
  );
}
