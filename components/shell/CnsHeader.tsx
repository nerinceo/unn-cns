import Link from "next/link";
import Image from "next/image";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { AppSwitcher } from "./AppSwitcher";

/**
 * Header for CNS. Reads the SAME public.users row HUB renders, via the SAME
 * session cookie — so the member's name and avatar are identical across both
 * domains. That equivalence is the visible proof that SSO works.
 */
export async function CnsHeader() {
  const profile = await getCurrentUserProfile();
  const name = profile?.full_name ?? "Member";
  const photo = profile?.profile_photo as string | undefined;

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-card">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded-md bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">
            UNN
          </span>
          <span className="text-lg font-semibold text-primary">CNS</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <AppSwitcher current="cns" />
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
  );
}
