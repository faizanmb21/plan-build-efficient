import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export interface SubNavTab {
  to: string;
  label: string;
}

/**
 * Horizontal pill sub-nav shown at the top of a grouped sidebar section
 * (e.g. Trainees -> Members / Attendance). Pure route links, so every
 * existing page keeps its own URL — this is purely a navigation aid.
 */
export function SectionSubNav({ tabs }: { tabs: SubNavTab[] }) {
  const location = useLocation();
  if (tabs.length === 0) return null;
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
      {tabs.map((t) => {
        const active =
          location.pathname === t.to || location.pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
              active
                ? "bg-primary/80 text-primary-foreground shadow-[0_2px_10px_-2px_oklch(0.62_0.24_268/0.5)] border border-white/15"
                : "text-muted-foreground border border-transparent hover:bg-white/5 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
