import { CrawlableShell } from "@/components/shell/CrawlableShell";

/**
 * Employer profiles are public and crawlable, exactly like /jobs, so they get
 * the same adaptive chrome: the member shell when signed in, a public header
 * with a sign-in call to action when not.
 */
export default function EmployersLayout({ children }: { children: React.ReactNode }) {
  return <CrawlableShell>{children}</CrawlableShell>;
}
