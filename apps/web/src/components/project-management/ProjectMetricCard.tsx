import { cn } from "~/lib/utils";

interface ProjectMetricCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly detail?: string | null;
  readonly className?: string;
}

export function ProjectMetricCard({ label, value, detail, className }: ProjectMetricCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3 py-2", className)}>
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-normal text-foreground">{value}</div>
      {detail ? <div className="text-muted-foreground mt-1 text-xs">{detail}</div> : null}
    </div>
  );
}
