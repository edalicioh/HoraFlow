import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
