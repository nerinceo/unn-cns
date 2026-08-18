import { CrawlableShell } from "@/components/shell/CrawlableShell";

/**
 * Jobs sits OUTSIDE the members-only groups on purpose — see CrawlableShell
 * for why, and for the adaptive chrome this shares with /employers.
 */
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <CrawlableShell>{children}</CrawlableShell>;
}
