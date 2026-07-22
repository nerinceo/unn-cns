import Link from "next/link";
import Image from "next/image";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { PortalSwitcher } from "./PortalSwitcher";
import { SideNav, MobileNav } from "./SideNav";
import type { NavItem } from "./nav";

/**
 * One shell, three portals.
 *
 * Chrome is identical everywhere so the product still feels like one thing;
 * only the nav array and the wordmark change. Access is enforced by each route
 * group's layout, not here — this just renders what it is handed.
 */
export async function AppShell({
  portal,
  nav,
  wordmark,
  employers,
  isStaff,
  children,
}: {
  portal: "member" | "employer" | "admin";
  nav: NavItem[];
  wordmark: string;
  employers?: { id: string; name: string }[];
  isStaff?: boolean;
  children: React.ReactNode;
}) {
  const profile = await getCurrentUserProfile();
  const name = (profile?.full_name as string) ?? "Member";
  const photo = profile?.profile_photo as string | undefined;

  return (
    <>
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-card">
        <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-4">
          <Link href={portal === "member" ? "/" : nav[0]?.href ?? "/"} className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">
              UNN
            </span>
            <span className="text-lg font-semibold text-primary">{wordmark}</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <PortalSwitcher current={portal} employers={employers} isStaff={isStaff} />
            <a
              href={hubLink("/profile/me")}
              className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-muted"
              title={`${name} — open profile in UNN Hub`}
            >
              {photo ? (
                <Image src={photo} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
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

      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-24 pt-6 md:pb-8">
        <SideNav items={nav} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <MobileNav items={nav} />
    </>
  );
}
