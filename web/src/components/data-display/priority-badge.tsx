import { PRIORITY_STYLES } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { BadgeMeta } from "@/types/domain";

export function PriorityBadge({ priority }: { priority: BadgeMeta | string }) {
  const value = typeof priority === "string" ? priority : priority.value;
  const label = typeof priority === "string" ? priority : priority.label;
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]", PRIORITY_STYLES[value] || PRIORITY_STYLES.MEDIUM)}>{label}</span>;
}

