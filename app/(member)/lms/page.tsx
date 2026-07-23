import { School } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "LMS — Central Nursing Systems" };

export default function LmsPage() {
  return (
    <ModuleStub
      icon={School}
      title="LMS"
      intro="Explore nursing courses and colleges from different countries through connected learning management systems."
      planned={[
        "Courses organised into modules and lessons with video",
        "Colleges and programmes from multiple countries in one place",
        "Enrolment and per-lesson progress",
        "CPD hours and completion certificates",
      ]}
    />
  );
}
