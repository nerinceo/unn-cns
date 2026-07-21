import { cn } from "@/lib/utils/cn";

interface BadgeProps {
  children?: React.ReactNode;
  variant?: "default" | "secondary" | "verified" | "pending" | "student" | "community";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  if (variant === "verified") {
    return (
      <span className={cn("inline-flex items-center shrink-0", className)} title="Verified" aria-label="Verified">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#0a66c2" />
          <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variant === "default" && "bg-muted text-muted-foreground",
        variant === "secondary" && "bg-gray-100 text-gray-600",
        variant === "pending" && "bg-yellow-100 text-yellow-800",
        variant === "student" && "bg-blue-100 text-blue-800",
        variant === "community" && "bg-violet-100 text-violet-800",
        className
      )}
    >
      {children}
    </span>
  );
}
