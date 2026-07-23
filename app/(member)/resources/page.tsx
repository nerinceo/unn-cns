import { Calculator } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Resources — Central Nursing Systems" };

export default function ResourcesPage() {
  return (
    <ModuleStub
      icon={Calculator}
      title="Resources"
      intro="Calculators, templates, checklists, clinical tools, downloads and career resources."
      planned={[
        "Clinical calculators — dosage, drip rates, BMI and more",
        "Templates and checklists for care plans and handovers",
        "Downloadable references and revision aids",
        "Career resources — CV templates and interview guides",
      ]}
    />
  );
}
