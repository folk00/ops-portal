import Link from "next/link";
import { format, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteListItem } from "@/types/domain";

export function SiteSummaryCard({ site }: { site: SiteListItem }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{site.site_code}</div>
          <CardTitle className="mt-2 text-lg">{site.site_name}</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">{site.market}</div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/sites/${site.id}`}>Open</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Open</div>
          <div className="mt-1 text-2xl font-semibold">{site.open_tasks}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Pending / on hold</div>
          <div className="mt-1 text-2xl font-semibold">{site.blocked_tasks}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Next window</div>
          <div className="mt-1 text-sm font-medium">{site.next_migration_date ? format(parseISO(site.next_migration_date), "MMM d") : "Not set"}</div>
        </div>
      </CardContent>
    </Card>
  );
}
