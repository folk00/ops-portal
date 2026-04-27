"use client";

import { endOfWeek, format, startOfDay } from "date-fns";

import { EmptyState } from "@/components/data-display/empty-state";
import { WorkloadSummaryCard } from "@/components/data-display/workload-summary-card";
import { PageHeader } from "@/components/shell/page-header";
import { useCapacity } from "@/lib/queries";

export function CapacityPage() {
  const { data, isLoading } = useCapacity();

  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-white" />;
  if (!data) return <EmptyState title="Capacity unavailable" description="Seed the database and start the API to calculate workload and PTO overlays." />;
  const today = startOfDay(new Date());
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  const trackerBehindSiteCount = new Set(
    data.people.flatMap((person) =>
      person.focus_sites
        .filter((site) => site.overdue_tasks > 0)
        .map((site) => site.site_name)
    )
  ).size;
  const thisWeekWindowSiteCount = new Set(
    data.people.flatMap((person) =>
      person.focus_sites
        .filter((site) => {
          if (!site.next_window) return false;
          const nextWindow = startOfDay(new Date(site.next_window));
          return nextWindow >= today && nextWindow <= weekEnd;
        })
        .map((site) => site.site_name)
    )
  ).size;

  return (
    <div className="space-y-6">
      <PageHeader title="Capacity" subtitle="Engineer view centered on today-forward sites and the tracker work that is actually behind or due this week." />

      <div className="grid gap-4 md:grid-cols-4">
        <WorkloadSummaryCard label="People in play" value={data.active_people_count} tone="neutral" />
        <WorkloadSummaryCard label="Sites in play" value={data.focus_site_count} tone="green" />
        <WorkloadSummaryCard label="Tracker behind" value={trackerBehindSiteCount} tone="amber" />
        <WorkloadSummaryCard label="Windows this week" value={thisWeekWindowSiteCount} tone="neutral" />
      </div>

      <div className="grid gap-3">
        {data.people.map((person) => {
          const trackerBehindSites = person.focus_sites.filter((site) => site.overdue_tasks > 0).length;
          const thisWeekWindowSites = person.focus_sites.filter((site) => {
            if (!site.next_window) return false;
            const nextWindow = startOfDay(new Date(site.next_window));
            return nextWindow >= today && nextWindow <= weekEnd;
          }).length;

          return (
          <div key={person.user.id} className="grid gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{person.user.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{person.user.role} | {person.user.team}</div>
              </div>
              <div className="rounded-full border border-border bg-slate-50 px-3 py-1 text-sm text-slate-600">
                {person.allocation_percent}% allocation
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
              <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sites</div><div className="mt-2 text-2xl font-semibold">{person.assigned_sites}</div></div>
              <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tracker behind</div><div className="mt-2 text-2xl font-semibold text-rose-600">{trackerBehindSites}</div></div>
              <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Windows this week</div><div className="mt-2 text-2xl font-semibold text-blue-600">{thisWeekWindowSites}</div></div>
              <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Workstreams</div><div className="mt-2 text-2xl font-semibold">{person.workstreams.length}</div></div>
              <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">PTO</div><div className="mt-2 text-sm font-medium">{person.pto.length ? `${person.pto[0].start} to ${person.pto[0].end}` : "Clear"}</div></div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sites needing attention</div>
                <div className="mt-3 space-y-2">
                  {person.focus_sites.length ? (
                    person.focus_sites.map((site) => {
                      const nextWindow = site.next_window ? startOfDay(new Date(site.next_window)) : null;
                      const windowBadge = !nextWindow
                        ? { label: "Window TBD", className: "border-slate-200 bg-slate-50 text-slate-700" }
                        : nextWindow <= weekEnd
                            ? { label: "Window this week", className: "border-amber-200 bg-amber-50 text-amber-700" }
                            : { label: "Upcoming", className: "border-sky-200 bg-sky-50 text-sky-700" };
                      const trackerBadge = site.overdue_tasks
                        ? { label: "Tracker behind", className: "border-rose-200 bg-rose-50 text-rose-700" }
                        : site.due_this_week
                          ? { label: "Prep due now", className: "border-blue-200 bg-blue-50 text-blue-700" }
                          : { label: "On track", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };

                      return (
                        <div key={site.site_name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-3">
                          <div>
                            <div className="font-medium">{site.site_name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Next window {site.next_window ? format(new Date(site.next_window), "MMM d, yyyy") : "TBD"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full border px-3 py-1 font-medium ${windowBadge.className}`}>
                              {windowBadge.label}
                            </span>
                            <span className={`rounded-full border px-3 py-1 font-medium ${trackerBadge.className}`}>
                              {trackerBadge.label}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-sm text-muted-foreground">No active today-forward sites assigned.</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Workstreams in play</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {person.workstreams.length ? (
                    person.workstreams.map((item) => (
                      <span key={item} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No workstreams linked</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
