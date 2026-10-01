import { HeartHandshake } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "Services — Central Nursing Systems" };

export default function ServicesPage() {
  return (
    <ModuleStub
      icon={HeartHandshake}
      title="Services"
      intro="Professional nursing services, guidance and support."
      planned={[
        "Career guidance and mentorship",
        "Application and interview support",
        "Credential and licensure guidance",
        "Direct support from the Nerusalem team",
      ]}
    />
  );
}
