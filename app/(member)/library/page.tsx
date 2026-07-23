import { Library } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Library — Central Nursing Systems" };

export default function LibraryPage() {
  return (
    <ModuleStub
      icon={Library}
      title="Library"
      intro="Access nursing books, articles, guidelines, research, Nursepedia and clinical reference materials."
      planned={[
        "Nursing books, articles and clinical guidelines",
        "Research and evidence summaries",
        "Nursepedia — a nursing reference encyclopedia",
        "Your purchased books and question banks from the UNN marketplace, gathered in one place",
      ]}
    />
  );
}
