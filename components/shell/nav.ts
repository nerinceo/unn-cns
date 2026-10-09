import {
  BookOpen, BookOpenCheck, ClipboardList, Briefcase, Library, TrendingUp, Home, FileText,
  Building2, Inbox, LayoutDashboard, Settings, Users, Send, UserRound, Bookmark, Flag,
  GraduationCap, Bot, School, BadgeCheck, Calculator, HeartHandshake, LayoutGrid, PlusCircle, Rss,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Navigation, one definition per portal.
 *
 * CNS has three distinct audiences and they must not see each other's tools: a
 * nurse has no business seeing an applications inbox, and a recruiter has no
 * business seeing a question bank. HUB's mistake was one flat nav duplicated
 * three times and drifting; here each portal owns exactly one array and the
 * shell renders whichever the route group supplies.
 */

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Member information architecture (CNS "Central Nerusalem Space" brief).
 *
 * Primary nav is deliberately short — Home, Learn, Jobs, Nubo — with everything
 * else behind More. The old flat list of eleven items is reorganised into
 * hubs, not deleted: Learn gathers the question bank, revision and progress;
 * Registry gathers the job profile, resume and verification; Jobs keeps the
 * board with saved and applications. Every prior route still resolves.
 */
export const MEMBER_PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/nubo", label: "Nubo", icon: Bot },
];

/** Behind the "More" menu. */
export const MEMBER_MORE: NavItem[] = [
  { href: "/lms", label: "LMS", icon: School },
  // Registry is gone: the career profile, its documents and its consent
  // switches are one page in HUB now (/profile/career). A nav entry that
  // bounces you to another app on click is worse than no entry — the old
  // routes still redirect for anyone arriving from a bookmark.
  { href: "/library", label: "Library", icon: Library },
  { href: "/resources", label: "Resources", icon: Calculator },
  { href: "/services", label: "Services", icon: HeartHandshake },
];

/**
 * Non-nurse healthcare professionals ('uhn' scope) see ONLY the job board.
 *
 * They reach CNS because their jobs and applications data has always lived in
 * cns_* tables; everything else here — the LMS, the question bank, the library
 * — is the nursing curriculum and is not theirs. Middleware enforces that (see
 * isCnsProfessionalPath in lib/access.ts); this array is what stops the nav
 * offering them four destinations that would bounce them straight back out.
 *
 * A separate array rather than a filter over MEMBER_PRIMARY: the nurse nav then
 * cannot be changed by accident while editing this one, and what a professional
 * sees is legible in one place.
 *
 * No Applications item. CNS has a page at /applications, but it is the NURSE's
 * list; a professional's lives in HUB at /pro/applications alongside the rest of
 * their account. The header's account chip links back there.
 */
export const PROFESSIONAL_PRIMARY: NavItem[] = [
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/saved", label: "Saved", icon: Bookmark },
];

/** The "More" trigger for the bottom bar (mobile). */
export const MORE_ICON: LucideIcon = LayoutGrid;

/** Flat list kept for anywhere that still enumerates every member destination. */
export const MEMBER_NAV: NavItem[] = [...MEMBER_PRIMARY, ...MEMBER_MORE];

/** Hospitals and agencies. Scoped to one organisation at a time. */
export function employerNav(employerId: string): NavItem[] {
  return [
    { href: `/employer/${employerId}`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/employer/${employerId}/jobs`, label: "Roles", icon: Briefcase },
    { href: `/employer/${employerId}/applications`, label: "Applications", icon: Inbox },
    { href: `/employer/${employerId}/settings`, label: "Organisation", icon: Settings },
  ];
}

/** Platform staff. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/employers", label: "Employers", icon: Building2 },
  { href: "/admin/jobs", label: "Job approvals", icon: Briefcase },
  { href: "/admin/job-sources", label: "Job sources", icon: Rss },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/content", label: "Content", icon: ClipboardList },
  { href: "/admin/members", label: "Members", icon: Users },
];

/**
 * Instructor portal — authoring only.
 *
 * There is no earnings or payout item here on purpose. A course is SOLD as a
 * marketplace listing in HUB, so money lives in HUB's seller dashboard. Showing
 * a revenue figure in CNS would mean two apps quoting the same number from
 * different sources, which is exactly how they drift apart.
 */
export const INSTRUCTOR_NAV: NavItem[] = [
  { href: "/instructor", label: "My courses", icon: LayoutDashboard },
  { href: "/instructor/new", label: "New course", icon: PlusCircle },
  { href: "/instructor/sales", label: "Sales", icon: TrendingUp },
  { href: "/instructor/settings", label: "Settings", icon: Settings },
];
