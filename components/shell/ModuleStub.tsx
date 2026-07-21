import type { LucideIcon } from "lucide-react";

/**
 * Placeholder for a module whose schema is designed but not yet built. Keeps
 * the nav complete and the product shape legible while depth lands one module
 * at a time.
 */
export function ModuleStub({
  icon: Icon,
  title,
  intro,
  planned,
}: {
  icon: LucideIcon;
  title: string;
  intro: string;
  planned: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-6">
        <p className="text-sm font-medium">Coming soon</p>
        <ul className="mt-3 space-y-2">
          {planned.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
