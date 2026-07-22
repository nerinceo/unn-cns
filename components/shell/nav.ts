import {
  BookOpen, ClipboardList, Briefcase, Library, TrendingUp, Home, FileText,
  Building2, Inbox, LayoutDashboard, Settings, Users, Send, UserRound, Bookmark,
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

/** Nurses and students — the default portal. */
export const MEMBER_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/question-bank", label: "Question Bank", icon: ClipboardList },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/applications", label: "My Applications", icon: Send },
  { href: "/profile", label: "Job Profile", icon: UserRound },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/library", label: "My Library", icon: Library },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

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
  { href: "/admin/content", label: "Content", icon: ClipboardList },
  { href: "/admin/members", label: "Members", icon: Users },
];
