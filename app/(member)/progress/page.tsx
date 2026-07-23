import { TrendingUp } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Progress — Central Nursing Systems" };

export default function ProgressPage() {
  return (
    <ModuleStub
      icon={TrendingUp}
      title="Progress"
      intro="Your learning across CNS — attempts, accuracy and topic mastery over time."
      planned={[
        "Question bank accuracy by subject and topic",
        "Course completion and lesson streaks",
        "Weak-topic suggestions drawn from attempt history",
        "A summary surfaced back on your UNN Hub profile",
      ]}
    />
  );
}
