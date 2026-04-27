import { STATUS_STYLES } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { BadgeMeta } from "@/types/domain";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Pending / on hold",
  IN_PROGRESS: "In progress",
  BLOCKED: "Pending / on hold",
  DONE: "Done",
  NA: "N/A",
};

export function StatusBadge({ status }: { status: BadgeMeta | string }) {
  const value = typeof status === "string" ? status : status.value;
  const label = typeof status === "string" ? (STATUS_LABELS[value] || status.replaceAll("_", " ")) : status.label;
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]", STATUS_STYLES[value] || STATUS_STYLES.NOT_STARTED)}>{label}</span>;
}
