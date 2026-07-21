import { Briefcase } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Jobs — UNN CNS" };

export default function JobsPage() {
  return (
    <ModuleStub
      icon={Briefcase}
      title="Jobs"
      intro="Nursing roles posted by verified hospitals and recruitment agencies. Apply with the UNN profile you already have."
      planned={[
        "Employer accounts for hospitals, clinics and agencies, verified before they can post",
        "Filter by specialty, location, employment type and experience",
        "One-tap apply using your UNN profile and verification status",
        "Application tracking — submitted, viewed, shortlisted",
        "Saved jobs and alerts",
      ]}
    />
  );
}
