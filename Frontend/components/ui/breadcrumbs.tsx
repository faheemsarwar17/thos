import Link from "next/link";
import { LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/cn";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <nav className={cn("breadcrumbs", className)} aria-label="Breadcrumbs">
      <ol style={{ display: "flex", alignItems: "center", gap: "8px", listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              {index > 0 && (
                <span className="breadcrumbs__separator" aria-hidden="true">
                  <LuChevronRight size={13} />
                </span>
              )}
              {isLast || !item.href ? (
                <span className="breadcrumbs__current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link className="breadcrumbs__link" href={item.href}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
