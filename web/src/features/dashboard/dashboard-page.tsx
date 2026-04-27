"use client";

import { endOfWeek, format, parseISO, startOfDay } from "date-fns";
import Link from "next/link";

import { EmptyState } from "@/components/data-display/empty-state";
import { SectionCard } from "@/components/data-display/section-card";
import { StatCard } from "@/components/data-display/stat-card";
import { StatusBadge } from "@/components/data-display/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useDashboardSummary, useHealthScores } from "@/lib/queries";

const HEALTH_TONE: Record<string, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lime: "border-lime-200 bg-lime-50 text-lime-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
};

export function DashboardPage() {
  const { data, isLoading } = useDashboardSummary();
  const { data: healthScores = [] } = useHealthScores();
  const today = startOfDay(new Date());
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  if (isLoading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-36 animate-pulse rounded-2xl border border-border bg-white" />)}</div>;
  }

  if (!data) {
    return <EmptyState title="Dashboard unavailable" description="Start the API and run the workbook-backed seed to populate the operations overview." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Today-forward control surface for migration volume, ownership clarity, and the sites that still need attention."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/tracker">Open Tracker</Link>
            </Button>
            <Button asChild>
              <Link href="/sites">Review Sites</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} hint={metric.change_hint} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Sites needing attention" description="Only looks at today-forward windows, not every historical task in the workbook.">
          <div className="space-y-3">
            {data.at_risk_sites.length ? (
              data.at_risk_sites.map((item) => (
                <div key={item.site.id} className="flex items-start justify-between rounded-xl border border-border bg-slate-50 px-4 py-3">
                  <div>
                    <div className="font-medium">{item.site.site_name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Implementation {item.next_window ? format(parseISO(item.next_window), "MMM d, yyyy") : "TBD"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full border px-3 py-1 font-medium ${
                        item.next_window && startOfDay(parseISO(item.next_window)) <= weekEnd
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-sky-200 bg-sky-50 text-sky-700"
                      }`}>
                        {item.next_window && startOfDay(parseISO(item.next_window)) <= weekEnd ? "Window this week" : "Upcoming"}
                      </span>
                      <span className={`rounded-full border px-3 py-1 font-medium ${
                        item.risk_label === "pending"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}>
                        {item.risk_label === "pending" ? "Tracker behind" : "Prep due now"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No today-forward sites are showing elevated risk right now.
              </div>
            )}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Quick views" description="System views seeded from the operational model.">
            <div className="grid gap-2">
              {data.system_views.map((view) => (
                <Link key={view.key} href={view.route} className="rounded-xl border border-border bg-slate-50 px-4 py-3 transition hover:bg-white">
                  <div className="font-medium">{view.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{view.description}</div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Health score watchlist" description="Lowest composite site scores, ordered from worst to best.">
            <div className="space-y-3">
              {healthScores.length ? (
                healthScores.slice(0, 5).map((site) => (
                  <Link key={site.site_id} href={`/sites/${site.site_id}`} className="flex items-center justify-between rounded-xl border border-border bg-slate-50 px-4 py-3 transition hover:bg-white">
                    <div className="min-w-0">
                      <div className="font-medium text-[#0c2f43]">{site.site_name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{site.label}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${HEALTH_TONE[site.grade_color] ?? HEALTH_TONE.red}`}>
                        {site.grade}
                      </span>
                      <div className="text-lg font-bold text-[#0c2f43]">{site.score}</div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  Health scores will appear here once the API returns site scoring data.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <SectionCard title="Technology focus" description="Per technology, who needs an owner and which sites have T-minus work already due now.">
          <div className="space-y-3">
            {data.tasks_by_workstream.map((item) => (
              <div key={item.workstream.key} className="rounded-xl border border-border px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{item.workstream.name}</div>
                  <div className="text-sm text-muted-foreground">{item.sites_in_play} sites in play</div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">This week</div>
                    <div className="mt-1 text-lg font-semibold">{item.windows_this_week}</div>
                    <div className="mt-2 text-sm text-slate-700">
                      {item.this_week_examples.length ? item.this_week_examples.join(" | ") : "No site windows this week"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Need owner</div>
                    <div className="mt-1 text-lg font-semibold">{item.needs_owner_sites}</div>
                    <div className="mt-2 text-sm text-slate-700">
                      {item.needs_owner_examples.length ? item.needs_owner_examples.join(" | ") : "All visible sites already have an owner"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">T-minus due now</div>
                    <div className="mt-1 text-lg font-semibold">{item.tminus_due_now_sites}</div>
                    <div className="mt-2 text-sm text-slate-700">
                      {item.tminus_due_now_examples.length ? item.tminus_due_now_examples.join(" | ") : "No near-term T-minus misses right now"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Owner focus" description="Ownership pressure by site, with the most urgent sites listed first.">
          <div className="space-y-3">
            {data.workload.length ? (
              data.workload.slice(0, 6).map((item) => (
                <div key={item.user.id} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.user.name}</div>
                    <StatusBadge
                      status={
                        item.load_label === "overloaded"
                          ? { value: "BLOCKED", label: "Overloaded", color: "amber" }
                          : item.load_label === "watch"
                            ? { value: "IN_PROGRESS", label: "Watch", color: "blue" }
                            : { value: "DONE", label: "Healthy", color: "green" }
                      }
                    />
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {item.assigned_sites} sites in play | {item.windows_this_week} this week | {item.tminus_due_now_sites} T-minus due now
                  </div>
                  {item.top_sites.length ? <div className="mt-2 text-sm text-slate-700">{item.top_sites.join(" | ")}</div> : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No owners are carrying active today-forward work yet.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Upcoming migration strip" description="One upcoming site per card, deduped so multi-technology sites do not inflate the list.">
          <div className="space-y-3">
            {data.upcoming_migrations.length ? (
              data.upcoming_migrations.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.site.site_name}</div>
                    <div className="text-sm text-muted-foreground">{format(parseISO(item.scheduled_date), "MMM d")}</div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {item.workstream?.name || "Cross-workstream"} | {item.change_ticket || "No change ticket"}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No upcoming today-forward migrations are scheduled yet.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent updates" description={`Last refreshed ${format(new Date(data.last_updated), "PPp")}.`}>
        <div className="grid gap-3">
          {data.recent_updates.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{item.task_title}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(item.created_at), "MMM d, HH:mm")}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{item.site_name} | {item.author?.name || "System import"}</div>
              <div className="mt-2 text-sm">{item.body}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
