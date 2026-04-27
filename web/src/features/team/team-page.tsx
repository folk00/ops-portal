"use client";

import { endOfWeek, format, parseISO, startOfDay } from "date-fns";

import { EmptyState } from "@/components/data-display/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { useUsers } from "@/lib/queries";
import type { UserRecord } from "@/types/domain";

function formatTaskExamples(titles: string[]) {
  return titles.join(" - ");
}

function sortAttentionSites(user: UserRecord) {
  return [...user.attention_sites].sort((left, right) => {
    const leftWindow = left.next_window ? startOfDay(parseISO(left.next_window)).getTime() : Number.MAX_SAFE_INTEGER;
    const rightWindow = right.next_window ? startOfDay(parseISO(right.next_window)).getTime() : Number.MAX_SAFE_INTEGER;

    if (leftWindow !== rightWindow) {
      return leftWindow - rightWindow;
    }
    if (left.overdue_tasks !== right.overdue_tasks) {
      return right.overdue_tasks - left.overdue_tasks;
    }
    if (left.due_this_week !== right.due_this_week) {
      return right.due_this_week - left.due_this_week;
    }
    return left.site_name.localeCompare(right.site_name);
  });
}

export function TeamPage() {
  const { data = [], isLoading } = useUsers();
  const today = startOfDay(new Date());
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-white" />;
  }

  if (!data.length) {
    return (
      <EmptyState
        title="No team roster"
        description="Import the workbook roster or run the seed to populate team ownership and allocation data."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle="Roster centered on today-forward sites, with the site names and tracker tasks that still need attention."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((user) => {
          const attentionSites = sortAttentionSites(user);
          const trackerBehindSites = attentionSites.filter((site) => site.overdue_tasks > 0).length;
          const thisWeekWindowSites = attentionSites.filter((site) => {
            if (!site.next_window) {
              return false;
            }
            const nextWindow = startOfDay(parseISO(site.next_window));
            return nextWindow >= today && nextWindow <= weekEnd;
          }).length;

          return (
            <div key={user.id} className="rounded-2xl border border-border bg-card px-5 py-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{user.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {user.role} | {user.team}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {user.current_pto.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      PTO {user.current_pto[0].start} to {user.current_pto[0].end}
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                    {user.allocation_percent}% allocation
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sites in play</div>
                  <div className="mt-2 text-2xl font-semibold">{user.assigned_sites}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tracker behind</div>
                  <div className="mt-2 text-2xl font-semibold text-rose-600">{trackerBehindSites}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Windows this week</div>
                  <div className="mt-2 text-2xl font-semibold text-blue-600">{thisWeekWindowSites}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sites needing action now</div>
                <div className="mt-3 space-y-2">
                  {attentionSites.length ? (
                    attentionSites.slice(0, 5).map((site) => {
                      const nextWindow = site.next_window ? startOfDay(parseISO(site.next_window)) : null;
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
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{site.site_name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Next window {site.next_window ? format(parseISO(site.next_window), "MMM d, yyyy") : "TBD"}
                            </div>
                            {site.overdue_task_titles.length ? (
                              <div className="mt-2 line-clamp-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-700">Late tasks:</span>{" "}
                                {formatTaskExamples(site.overdue_task_titles)}
                              </div>
                            ) : null}
                            {site.due_this_week_task_titles.length ? (
                              <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-700">Due now:</span>{" "}
                                {formatTaskExamples(site.due_this_week_task_titles)}
                              </div>
                            ) : null}
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
                    <div className="rounded-xl border border-border bg-white px-3 py-3 text-sm text-muted-foreground">
                      No late or near-term tracker items for this engineer right now.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {user.workstreams.map((workstream) => (
                  <span key={workstream} className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    {workstream}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
