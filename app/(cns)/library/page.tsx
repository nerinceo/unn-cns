import { Library } from "lucide-react";
import { ModuleStub } from "@/components/shell/ModuleStub";

export const metadata = { title: "My Library — UNN CNS" };

export default function LibraryPage() {
  return (
    <ModuleStub
      icon={Library}
      title="My Library"
      intro="Every book and question bank you have bought in the UNN marketplace, gathered in one place — something the marketplace itself does not currently offer."
      planned={[
        "All purchased digital goods across every order, including cart purchases",
        "Open a purchased PDF straight in the UNN Hub reader",
        "Unlocked question banks appear automatically once payment clears",
        "Nothing to re-buy — entitlement is read live from your order history",
      ]}
    />
  );
}
