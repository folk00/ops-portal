"use client";

import { format, parseISO } from "date-fns";

import { EmptyState } from "@/components/data-display/empty-state";
import { OwnerPill } from "@/components/data-display/owner-pill";
import { PriorityBadge } from "@/components/data-display/priority-badge";
import { SectionCard } from "@/components/data-display/section-card";
import { StatusBadge } from "@/components/data-display/status-badge";
import { TaskUpdateTimeline } from "@/components/data-display/task-update-timeline";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiteAiBriefCard } from "@/features/sites/site-ai-brief-card";
import { useSite, useSiteHealth, useSiteVelocity } from "@/lib/queries";

const HEALTH_TONE: Record<string, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lime: "border-lime-200 bg-lime-50 text-lime-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
};

const HEALTH_BAR: Record<string, string> = {
  green: "bg-emerald-500",
  lime: "bg-lime-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-rose-500",
};

function MetricBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${HEALTH_BAR[tone] ?? "bg-slate-400"}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function SiteDetailPage({ id }: { id: string }) {
  const { data, isLoading } = useSite(id);
  const siteId = Number(id);
  const resolvedSiteId = Number.isNaN(siteId) ? 0 : siteId;
  const { data: health, isLoading: healthLoading } = useSiteHealth(resolvedSiteId);
  const { data: velocity, isLoading: velocityLoading } = useSiteVelocity(resolvedSiteId);

  if (isLoading) return <div className="h-80 animate-pulse rounded-2xl border border-border bg-white" />;
  if (!data) return <EmptyState title="Site not found" description="The requested site could not be loaded from PostgreSQL." />;

  const groupsByKey = new Map(data.task_groups.map((group) => [group.workstream?.key || "UNASSIGNED", group]));
  const technologySections = data.site.technology_summaries.map((summary) => ({
    summary,
    group: groupsByKey.get(summary.key),
  }));
  const extraGroups = data.task_groups.filter((group) => !["SDWAN", "SDA", "WIRELESS"].includes(group.workstream?.key || "UNASSIGNED"));
  const defaultTechnology = technologySections.find((section) => section.summary.total_tasks > 0)?.summary.key || "SDWAN";

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.site.site_name}
        subtitle={`${data.site.site_code} | ${data.site.market}`}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SectionCard title="Open work">{data.site.open_tasks}</SectionCard>
        <SectionCard title="Pending / on hold">{data.site.blocked_tasks}</SectionCard>
        <SectionCard title="Done">{data.site.done_tasks}</SectionCard>
        <SectionCard title="Next migration">{data.site.next_migration_date ? format(parseISO(data.site.next_migration_date), "PPP") : "TBD"}</SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Operational health" description="Composite readiness score based on completion, timeliness, next window readiness, and ownership coverage.">
          {healthLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-24 animate-pulse rounded-xl border border-border bg-slate-50" />
              <div className="h-24 animate-pulse rounded-xl border border-border bg-slate-50" />
            </div>
          ) : !health ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              Health scoring is not available for this site yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Current site score</div>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  <div className="text-4xl font-bold text-[#0c2f43]">{health.score}</div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${HEALTH_TONE[health.grade_color] ?? HEALTH_TONE.red}`}>
                    Grade {health.grade}
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {health.label}
                  {health.next_window_date ? ` | Next window ${format(parseISO(health.next_window_date), "MMM d, yyyy")}` : ""}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <MetricBar label="Completeness" value={health.breakdown.completion_pct} tone={health.grade_color} />
                <MetricBar label="Timeliness" value={health.breakdown.timeliness_pct} tone={health.grade_color} />
                <MetricBar label="Window readiness" value={health.breakdown.readiness_pct} tone={health.grade_color} />
                <MetricBar label="Ownership coverage" value={health.breakdown.coverage_pct} tone={health.grade_color} />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Velocity outlook" description="Completion pace over recent history compared with the next migration window.">
          {velocityLoading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-xl border border-border bg-slate-50" />
              <div className="h-20 animate-pulse rounded-xl border border-border bg-slate-50" />
            </div>
          ) : !velocity ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              Velocity data is not available for this site yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Done</div>
                  <div className="mt-2 text-2xl font-semibold text-[#0c2f43]">{velocity.done_tasks}</div>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Remaining</div>
                  <div className="mt-2 text-2xl font-semibold text-[#0c2f43]">{velocity.remaining_tasks}</div>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Per week</div>
                  <div className="mt-2 text-2xl font-semibold text-[#0c2f43]">{velocity.velocity_per_week}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[#0c2f43]">
                      {velocity.estimated_completion_date
                        ? `Estimated complete ${format(parseISO(velocity.estimated_completion_date), "MMM d, yyyy")}`
                        : "Estimated completion unavailable"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {velocity.next_window_date
                        ? `Next window ${format(parseISO(velocity.next_window_date), "MMM d, yyyy")}`
                        : "No migration window scheduled"}
                      {typeof velocity.days_until_window === "number" ? ` | ${velocity.days_until_window} days out` : ""}
                    </div>
                  </div>
                  <div className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
                    velocity.on_track ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    {velocity.on_track ? "On track" : "Needs attention"}
                  </div>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">Confidence: {velocity.confidence.replaceAll("_", " ")}</div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SiteAiBriefCard siteId={data.site.id} />

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <SectionCard title="Technology task lanes" description="Each site stays single, but the work is split exactly by the workbook technology tabs: SD-WAN, SDA, and Wireless.">
            <Tabs defaultValue={defaultTechnology} className="space-y-4">
              <TabsList>
                {technologySections.map(({ summary }) => (
                  <TabsTrigger key={summary.key} value={summary.key}>
                    {summary.label} ({summary.total_tasks})
                  </TabsTrigger>
                ))}
                {extraGroups.length ? <TabsTrigger value="OTHER">Program & other</TabsTrigger> : null}
              </TabsList>

              {technologySections.map(({ summary, group }) => (
                <TabsContent key={summary.key} value={summary.key} className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <SectionCard title={`${summary.label} total`}>{summary.total_tasks}</SectionCard>
                    <SectionCard title="Open">{summary.open_tasks}</SectionCard>
                    <SectionCard title="Pending / on hold">{summary.blocked_tasks}</SectionCard>
                    <SectionCard title="Done">{summary.done_tasks}</SectionCard>
                  </div>

                  {group?.tasks.length ? (
                    <div className="space-y-3">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{task.title}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {task.timeline_label} | {task.phase || "No phase"} | {task.description || "Workbook-migrated operational task"}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge status={task.status} />
                              <PriorityBadge priority={task.priority} />
                              <OwnerPill owner={task.owner} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title={`No ${summary.label} tasks mapped`}
                      description={`This site currently has no migrated ${summary.label} tasks from the workbook.`}
                    />
                  )}
                </TabsContent>
              ))}

              {extraGroups.length ? (
                <TabsContent value="OTHER" className="space-y-4">
                  {extraGroups.map((group) => (
                    <SectionCard
                      key={group.workstream?.key || "unassigned"}
                      title={group.workstream?.name || "Unassigned work"}
                      description="Cross-workstream or non-technology tasks kept outside the three primary tracker tabs."
                    >
                      <div className="space-y-3">
                        {group.tasks.map((task) => (
                          <div key={task.id} className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">{task.title}</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {task.timeline_label} | {task.phase || "No phase"} | {task.description || "Workbook-migrated operational task"}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge status={task.status} />
                                <PriorityBadge priority={task.priority} />
                                <OwnerPill owner={task.owner} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  ))}
                </TabsContent>
              ) : null}
            </Tabs>
          </SectionCard>
        </TabsContent>

        <TabsContent value="schedule">
          <SectionCard title="Migration windows" description="Scheduled windows persisted separately from tracker tasks.">
            <div className="space-y-3">
              {data.migration_windows.map((window) => (
                <div key={window.id} className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{format(parseISO(window.scheduled_date), "PPP")}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{window.workstream?.name || "Cross-workstream"} | {window.change_ticket || "No change ticket"}</div>
                    </div>
                    <StatusBadge status={window.status} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="updates">
          <SectionCard title="Operational updates" description="Recent comments and migration notes close to the work.">
            <TaskUpdateTimeline updates={data.updates} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="artifacts">
          <SectionCard title="Artifacts" description="Links and plans associated with this site.">
            <div className="space-y-3">
              {data.artifacts.map((artifact) => (
                <a key={artifact.id} href={artifact.url} target="_blank" className="block rounded-xl border border-border bg-slate-50 px-4 py-4 hover:bg-white">
                  <div className="font-medium">{artifact.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{artifact.artifact_type} | {artifact.notes || "Operational attachment"}</div>
                </a>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
