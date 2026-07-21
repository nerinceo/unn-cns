import { CnsHeader } from "@/components/shell/CnsHeader";
import { CnsSidebar } from "@/components/shell/CnsSidebar";
import { CnsMobileNav } from "@/components/shell/CnsMobileNav";

export default function CnsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <CnsHeader />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-24 pt-6 md:pb-8">
        <CnsSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CnsMobileNav />
    </>
  );
}
