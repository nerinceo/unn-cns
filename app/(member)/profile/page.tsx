import { redirect } from "next/navigation";
import { hubLink } from "@/lib/hub";

/**
 * The job profile moved to HUB.
 *
 * Same record, same fields — career_profiles, which this app still reads for
 * job matching and the application snapshot. Only the editing surface moved.
 * See ../registry/page.tsx for why this redirects rather than 404s.
 */
export default function JobProfileMoved() {
  redirect(hubLink("/profile/career"));
}
