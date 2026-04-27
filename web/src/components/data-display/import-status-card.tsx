import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportRecord } from "@/types/domain";

export function ImportStatusCard({ item }: { item: ImportRecord }) {
  const tone = item.status === "SUCCESS" ? "green" : item.status === "PARTIAL" ? "amber" : "red";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">{item.file_name}</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">{format(new Date(item.imported_at), "PPp")}</div>
        </div>
        <Badge tone={tone as never}>{item.status}</Badge>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground">
        <div>Created tasks: {item.created_tasks}</div>
        <div>Updated tasks: {item.updated_tasks}</div>
        <div>Warnings: {item.warnings_count} · Errors: {item.errors_count}</div>
      </CardContent>
    </Card>
  );
}

