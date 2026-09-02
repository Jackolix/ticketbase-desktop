import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Actions aligned to the right of the heading. */
  children?: ReactNode;
}

/**
 * Shared page heading.
 *
 * Every page used to size its own title — mostly `text-3xl font-bold`, which
 * is far too loud for a dense operational tool and made each screen feel like
 * a different app. One component keeps the scale honest.
 */
export function PageHeader({ title, description, icon: Icon, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {Icon && <Icon className="h-5 w-5 shrink-0" />}
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
