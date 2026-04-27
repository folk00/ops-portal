import { formatDistanceToNow } from "date-fns";

import { UpdateTypeBadge } from "@/components/data-display/update-type-badge";
import type { TaskUpdateRecord } from "@/types/domain";

export function TaskUpdateTimeline({ updates }: { updates: TaskUpdateRecord[] }) {
  if (!updates.length) {
    return <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">No execution updates yet.</div>;
  }

  return (
    <div className="space-y-3">
      {updates.map((update) => (
        <div key={update.id} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium">{update.author?.name || "System import"}</div>
              <UpdateTypeBadge updateType={update.update_type} />
            </div>
            <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}</div>
          </div>
          <div className="mt-2 text-sm text-slate-700">{update.body}</div>
        </div>
      ))}
    </div>
  );
}
