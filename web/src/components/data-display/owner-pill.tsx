import { User2 } from "lucide-react";

import type { UserLite } from "@/types/domain";

export function OwnerPill({ owner }: { owner?: UserLite | null }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm">
      <User2 className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{owner?.name || "Unassigned"}</span>
    </div>
  );
}

