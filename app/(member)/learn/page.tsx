import { BookOpen } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Learn — UNN CNS" };

export default function LearnPage() {
  return (
    <ModuleStub
      icon={BookOpen}
      title="Learn"
      intro="Structured nursing courses authored by the UNN team — modules, lessons, video and progress tracking."
      planned={[
        "Courses organised into modules and lessons",
        "Rich lesson content with embedded video",
        "Enrolment and per-lesson progress",
        "Free preview lessons before enrolling",
        "Completion tracking, with certificates to follow",
      ]}
    />
  );
}
