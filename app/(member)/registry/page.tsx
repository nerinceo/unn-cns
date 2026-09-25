import { redirect } from "next/navigation";
import { hubLink } from "@/lib/hub";

/**
 * The registry moved to HUB.
 *
 * It used to be four screens across two apps — the career profile and CV here,
 * the professional's equivalent in HUB under /pro, the visibility switches in
 * both, and identity verification somewhere else again. A member had to know
 * which app held which part of their own record. There is one record now
 * (career_profiles) and one page for it, beside the profile it belongs to.
 *
 * A REDIRECT RATHER THAN A DELETE. This path is in people's history, in the
 * "Registry" card on the CNS home page until it propagates, and in whatever
 * emails and bookmarks already went out. Sending them where the thing actually
 * lives costs one hop; a 404 costs them the feature.
 */
export default function RegistryMoved() {
  redirect(hubLink("/profile/career"));
}
