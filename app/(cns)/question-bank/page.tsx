import { ClipboardList } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Question Bank — UNN CNS" };

export default function QuestionBankPage() {
  return (
    <ModuleStub
      icon={ClipboardList}
      title="Question Bank"
      intro="Practice sets, mock exams and past papers, organised by university, program, subject and topic."
      planned={[
        "Browse by university — multi-institution from day one, with questions shareable across them",
        "Timed and untimed attempts with negative marking",
        "Per-question explanations revealed after submission",
        "Topic-level mastery tracking and bookmarks",
        "Premium question banks unlocked by a marketplace purchase",
      ]}
    />
  );
}
