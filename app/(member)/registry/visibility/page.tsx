import { redirect } from "next/navigation";
import { hubLink } from "@/lib/hub";

/** Consent lives on the Visibility step of HUB's career workspace. See ../page.tsx. */
export default function VisibilityMoved() {
  redirect(hubLink("/profile/career"));
}
