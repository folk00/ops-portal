"use client";

import { format } from "date-fns";

import { EmptyState } from "@/components/data-display/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { useCalendar } from "@/lib/queries";

export function CalendarPage() {
  const { data, isLoading } = useCalendar();

  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-white" />;
  if (!data) return <EmptyState title="Calendar unavailable" description="No migration windows, calls, or PTO ranges are available yet." />;

  const grouped = data.events.reduce<Record<string, typeof data.events>>((acc, event) => {
    const key = format(new Date(event.start), "yyyy-MM-dd");
    acc[key] = acc[key] || [];
    acc[key].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Operations-first schedule view combining migration windows, calls, and PTO overlays from normalized records." />
      <div className="space-y-4">
        {Object.entries(grouped).map(([day, events]) => (
          <div key={day} className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-5 py-4">
              <div className="text-lg font-semibold">{format(new Date(day), "EEEE, MMM d")}</div>
            </div>
            <div className="grid gap-3 px-5 py-4">
              {events.map((event) => (
                <div key={event.id} className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{event.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")} · {event.type}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">{event.site?.site_name || event.owner?.name || "Shared"}</div>
                  </div>
                  {event.notes ? <div className="mt-2 text-sm text-slate-700">{event.notes}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

