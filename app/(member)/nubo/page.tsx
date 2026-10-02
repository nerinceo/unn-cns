import { Bot } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Nubo — Central Nerusalem Space" };

export default function NuboPage() {
  return (
    <ModuleStub
      icon={Bot}
      title="Nubo"
      intro="A personal companion for learning, planning, reminders, career support and daily guidance."
      planned={[
        "Study planning and revision reminders built around your exams",
        "Career support — role suggestions and application nudges",
        "Quick answers drawn from your question bank and revision material",
        "Daily guidance tailored to where you are in your nursing journey",
      ]}
    />
  );
}
