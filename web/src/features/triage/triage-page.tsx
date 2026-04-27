"use client";

import type { ComponentType } from "react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ShieldAlert,
  TimerReset,
  UserRoundX,
} from "lucide-react";

import { EmptyState } from "@/components/data-display/empty-state";
import { SectionCard } from "@/components/data-display/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { useTriageSites } from "@/lib/queries";
import type { MilestoneDetail, TriageDriverTask, TriageSiteSummary, TriageTechnologyReadiness } from "@/types/domain";

const REASON_META: Record<
  string,
  { label: string; color: string; Icon: ComponentType<{ className?: string }> }
> = {
  in_flight: { label: "In Flight", color: "bg-sky-100 text-sky-800 border-sky-200", Icon: Activity },
  window_this_week: { label: "Window This Week", color: "bg-blue-100 text-blue-800 border-blue-200", Icon: CalendarClock },
  window_next_two_weeks: { label: "Next 2 Weeks", color: "bg-indigo-100 text-indigo-800 border-indigo-200", Icon: CalendarClock },
  critical_no_owner: { label: "Critical No Owner", color: "bg-rose-100 text-rose-800 border-rose-200", Icon: UserRoundX },
  critical_open: { label: "Critical Open", color: "bg-rose-100 text-rose-800 border-rose-200", Icon: ShieldAlert },
  overdue_high: { label: "High Overdue", color: "bg-orange-100 text-orange-800 border-orange-200", Icon: AlertTriangle },
  overdue: { label: "Overdue", color: "bg-amber-100 text-amber-800 border-amber-200", Icon: TimerReset },
  t2_gap: { label: "T-2 Work Open", color: "bg-rose-100 text-rose-800 border-rose-200", Icon: AlertTriangle },
  peer_review_gap: { label: "Peer Review Gap", color: "bg-violet-100 text-violet-800 border-violet-200", Icon: ShieldAlert },
  owner_gap: { label: "Owner Gaps", color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200", Icon: UserRoundX },
  due_this_week: { label: "Due This Week", color: "bg-cyan-100 text-cyan-800 border-cyan-200", Icon: CalendarClock },
  silent_site: { label: "Silent Site", color: "bg-slate-100 text-slate-700 border-slate-200", Icon: Activity },
};

const HEALTH_STYLE: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-lime-100 text-lime-700 border-lime-200",
  C: "bg-yellow-100 text-yellow-700 border-yellow-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  F: "bg-rose-100 text-rose-700 border-rose-200",
};

const READINESS_STYLE: Record<string, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  late: "border-rose-200 bg-rose-50 text-rose-700",
  due_now: "border-orange-200 bg-orange-50 text-orange-700",
  at_risk: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  missing: "border-slate-200 bg-slate-50 text-slate-700",
  not_applicable: "border-slate-200 bg-slate-50 text-slate-500",
};

const FORECAST_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  go: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", label: "GO" },
  at_risk: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", label: "AT RISK" },
  no_go: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-700", label: "NO-GO" },
};

const MILESTONE_DOT_STYLE: Record<string, string> = {
  done: "bg-emerald-500",
  current: "bg-sky-500 ring-2 ring-sky-200",
  late: "bg-rose-500 ring-2 ring-rose-200",
  future: "bg-slate-200",
};

function MetricPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warn"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#0c2f43]">{value}</div>
    </div>
  );
}

function DriverRow({ driver }: { driver: TriageDriverTask }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-sm font-medium text-[#0c2f43]">
        {driver.phase ? <span className="text-slate-400">{driver.phase} / </span> : null}
        {driver.title}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {driver.workstream_name ? <span>{driver.workstream_name}</span> : null}
        <span>{driver.priority_label}</span>
        <span>{driver.owner_name ?? "Unassigned"}</span>
        {driver.due_date ? (
          <span className={driver.days_overdue > 0 ? "font-medium text-rose-600" : ""}>
            Due {format(parseISO(driver.due_date), "MMM d")}
            {driver.days_overdue > 0 ? ` (${driver.days_overdue}d overdue)` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function readinessLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "late") return "Late";
  if (status === "due_now") return "Due now";
  if (status === "at_risk") return "At risk";
  if (status === "in_progress") return "In progress";
  if (status === "missing") return "Missing";
  return "N/A";
}

function MilestoneTracker({ milestones, expected }: { milestones: MilestoneDetail[]; expected?: string | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {milestones.map((m, i) => {
        const isExpected = m.label === expected;
        const dotColor = MILESTONE_DOT_STYLE[m.status] ?? MILESTONE_DOT_STYLE.future;
        return (
          <div key={m.label} className="flex items-center">
            <div className="flex flex-col items-center" title={`${m.label}: ${m.done}/${m.total} done (${m.status})`}>
              <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
              <div className={`mt-0.5 text-[9px] leading-none ${isExpected ? "font-bold text-[#0c2f43]" : "text-muted-foreground"}`}>
                {m.label}
              </div>
              {isExpected ? <div className="mt-px text-[8px] text-amber-600">^</div> : null}
            </div>
            {i < milestones.length - 1 ? (
              <div className={`mx-0.5 h-px w-3 ${m.status === "done" ? "bg-emerald-400" : "bg-slate-200"}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TechnologyReadinessCard({ item }: { item: TriageTechnologyReadiness }) {
  const behindText = item.milestones_behind > 0
    ? `${item.milestones_behind} ${item.milestones_behind === 1 ? "milestone" : "milestones"} behind`
    : item.milestone_detail.length > 0 ? "On track" : null;

  const behindColor = item.milestones_behind >= 3
    ? "text-rose-600"
    : item.milestones_behind >= 1
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0c2f43]">{item.workstream_name}</span>
            {behindText ? (
              <span className={`text-[11px] font-medium ${behindColor}`}>{behindText}</span>
            ) : null}
          </div>
          {item.milestone_detail.length > 0 ? (
            <div className="mt-2">
              <MilestoneTracker milestones={item.milestone_detail} expected={item.expected_milestone} />
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">No sequenced tasks</div>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${READINESS_STYLE[item.t2_status] ?? READINESS_STYLE.not_applicable}`}>
          {readinessLabel(item.t2_status)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">T-2 Open</div>
          <div className="text-base font-semibold text-[#0c2f43]">{item.t2_open_total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Peer Review</div>
          <div className="text-xs font-semibold text-[#0c2f43]">{readinessLabel(item.peer_review_status)}</div>
          <div className="text-[10px] text-muted-foreground">{item.peer_review_done_total}/{item.peer_review_total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">T-2 Done</div>
          <div className="text-base font-semibold text-[#0c2f43]">{item.t2_done_total}/{item.t2_due_total}</div>
        </div>
      </div>
    </div>
  );
}

function windowSummary(site: TriageSiteSummary) {
  if (!site.next_window_date) {
    return "No upcoming window";
  }
  if (site.window_bucket === "in_flight") {
    return `In flight now - ${site.next_window_status?.replaceAll("_", " ") ?? "ACTIVE"}`;
  }
  if (site.days_until_window === 0) {
    return `Window today - ${site.next_window_status?.replaceAll("_", " ") ?? "READY"}`;
  }
  return `${format(parseISO(site.next_window_date), "MMM d, yyyy")} - ${site.days_until_window}d out`;
}

function SiteCard({ site }: { site: TriageSiteSummary }) {
  return (
    <div className="rounded-2xl border border-[#b9d4df] bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#d7e6ed] bg-[linear-gradient(180deg,rgba(247,251,254,0.98),rgba(240,247,251,1))] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/sites/${site.site_id}`} className="text-xl font-semibold text-[#0c2f43] hover:text-[#0c6ea4] hover:underline">
              {site.site_name}
            </Link>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
              {site.site_code}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
              {site.region}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${HEALTH_STYLE[site.health_grade] ?? HEALTH_STYLE.C}`}>
              Health {site.health_score} ({site.health_grade})
            </span>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{windowSummary(site)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {site.reasons.map((reason) => {
              const meta = REASON_META[reason];
              if (!meta) {
                return null;
              }
              const { Icon } = meta;
              return (
                <span key={reason} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className={`shrink-0 rounded-2xl border-2 px-4 py-3 text-right ${(FORECAST_STYLE[site.forecast] ?? FORECAST_STYLE.at_risk).bg} ${(FORECAST_STYLE[site.forecast] ?? FORECAST_STYLE.at_risk).border}`}>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Forecast</div>
          <div className={`mt-1 text-2xl font-bold ${(FORECAST_STYLE[site.forecast] ?? FORECAST_STYLE.at_risk).text}`}>
            {(FORECAST_STYLE[site.forecast] ?? FORECAST_STYLE.at_risk).label}
          </div>
          {site.top_blocker ? (
            <div className="mt-1 max-w-[200px] text-[11px] leading-tight text-muted-foreground">{site.top_blocker}</div>
          ) : null}
          {site.runway_summary ? (
            <div className="mt-1 text-[10px] text-muted-foreground">{site.runway_summary}</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 md:grid-cols-4 xl:grid-cols-8">
        <MetricPill label="Open tasks" value={site.open_tasks} />
        <MetricPill label="Critical" value={site.critical_tasks} tone={site.critical_tasks > 0 ? "danger" : "default"} />
        <MetricPill label="High overdue" value={site.overdue_high_tasks} tone={site.overdue_high_tasks > 0 ? "danger" : "default"} />
        <MetricPill label="Overdue" value={site.overdue_tasks} tone={site.overdue_tasks > 0 ? "warn" : "default"} />
        <MetricPill label="Due this week" value={site.due_this_week_tasks} tone={site.due_this_week_tasks > 0 ? "warn" : "default"} />
        <MetricPill label="T-2 open" value={site.t2_open_total} tone={site.t2_open_total > 0 ? "danger" : "default"} />
        <MetricPill
          label="Peer review gaps"
          value={site.peer_review_blocked_workstreams}
          tone={site.peer_review_blocked_workstreams > 0 ? "danger" : "default"}
        />
        <MetricPill
          label="Owner gaps"
          value={site.owner_gap_workstreams}
          tone={site.owner_gap_workstreams > 0 ? "warn" : "default"}
        />
      </div>

      <div className="border-t border-[#d7e6ed] px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#0c2f43]">Milestone tracker by technology</div>
          <div className="text-xs text-muted-foreground">T-6 to T-0 progress per workstream. ^ marks where you should be today.</div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {site.technology_readiness.map((item) => (
            <TechnologyReadinessCard key={item.workstream_key} item={item} />
          ))}
        </div>
      </div>

      <div className="border-t border-[#d7e6ed] px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#0c2f43]">Driver activities</div>
          <div className="text-xs text-muted-foreground">
            {site.days_since_activity == null
              ? "No recent tracker activity"
              : site.days_since_activity === 0
                ? "Updated today"
                : `${site.days_since_activity}d since last update`}
          </div>
        </div>
        <div className="space-y-2">
          {site.drivers.map((driver) => (
            <DriverRow key={driver.task_id} driver={driver} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TriagePage() {
  const { data: sites, isLoading } = useTriageSites();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-56 animate-pulse rounded-2xl border border-border bg-white" />
        ))}
      </div>
    );
  }

  const urgentSites = sites?.filter((site) => site.window_bucket === "in_flight" || site.window_bucket === "this_week") ?? [];
  const nextSites = sites?.filter((site) => site.window_bucket === "next_two_weeks") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage"
        subtitle={`${sites?.length ?? 0} active sites need attention. This view stays focused on site-level tracker risk for live or near-term windows.`}
        actions={
          <a
            href="/api/triage/export"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
          >
            Export CSV
          </a>
        }
      />

      {!sites?.length ? (
        <EmptyState
          title="Nothing in triage"
          description="No active sites in flight or within the next 14 days need operational attention right now."
        />
      ) : (
        <div className="space-y-6">
          {urgentSites.length > 0 ? (
            <SectionCard
              title={`In flight and this week (${urgentSites.length})`}
              description="Closest windows first. These sites are already moving or need attention before the current week closes."
            >
              <div className="space-y-4">
                {urgentSites.map((site) => (
                  <SiteCard key={site.site_id} site={site} />
                ))}
              </div>
            </SectionCard>
          ) : null}

          {nextSites.length > 0 ? (
            <SectionCard
              title={`Next 2 weeks (${nextSites.length})`}
              description="Upcoming sites that already show tracker risk, ownership gaps, or stale activity."
            >
              <div className="space-y-4">
                {nextSites.map((site) => (
                  <SiteCard key={site.site_id} site={site} />
                ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}
    </div>
  );
}
