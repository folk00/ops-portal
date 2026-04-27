export type BadgeMeta = {
  value: string;
  label: string;
  color: string;
};

export type UserLite = {
  id?: number | null;
  name?: string | null;
  email?: string | null;
  team?: string | null;
  role?: string | null;
  allocation_percent?: number | null;
  weekly_hours?: number | null;
};

export type WorkstreamLite = {
  id?: number | null;
  key?: string | null;
  name?: string | null;
};

export type SiteLite = {
  id: number;
  site_code: string;
  site_name: string;
  region: string;
  market: string;
  migration_wave?: string | null;
};

export type MetricCard = {
  label: string;
  value: number;
  change_hint?: string | null;
};

export type TaskRecord = {
  id: number;
  site: SiteLite;
  workstream?: WorkstreamLite | null;
  migration_window_id?: number | null;
  implementation_date?: string | null;
  timeline_label: string;
  timeline_order: number;
  timeline_window_start?: string | null;
  timeline_window_end?: string | null;
  timeline_window_label?: string | null;
  phase?: string | null;
  title: string;
  description?: string | null;
  note_preview?: string | null;
  peer_review_preview?: string | null;
  peer_review_author?: UserLite | null;
  status: BadgeMeta;
  priority: BadgeMeta;
  owner?: UserLite | null;
  due_date?: string | null;
  completed_at?: string | null;
  source_type: string;
  source_tab?: string | null;
  source_row_key?: string | null;
  source_column_key?: string | null;
  site_engineer?: string | null;
  is_pristine_seed?: boolean;
  comment_count: number;
  updated_at: string;
};

export type DashboardSummary = {
  metrics: MetricCard[];
  tasks_by_workstream: Array<{
    workstream: WorkstreamLite;
    sites_in_play: number;
    windows_this_week: number;
    this_week_examples: string[];
    tminus_due_now_sites: number;
    tminus_due_now_examples: string[];
    needs_owner_sites: number;
    needs_owner_examples: string[];
  }>;
  workload: Array<{
    user: UserLite;
    assigned_sites: number;
    windows_this_week: number;
    tminus_due_now_sites: number;
    top_sites: string[];
    load_label: string;
  }>;
  recent_updates: Array<{
    id: number;
    task_id: number;
    task_title: string;
    site_name: string;
    body: string;
    update_type: string;
    created_at: string;
    author?: UserLite | null;
  }>;
  upcoming_migrations: Array<{
    id: number;
    site: SiteLite;
    scheduled_date: string;
    status: string;
    workstream?: WorkstreamLite | null;
    change_ticket?: string | null;
  }>;
  at_risk_sites: Array<{
    site: SiteLite;
    blocked_tasks: number;
    due_this_week: number;
    next_window?: string | null;
    risk_label: string;
  }>;
  system_views: SystemView[];
  last_updated: string;
};

export type SystemView = {
  key: string;
  label: string;
  description: string;
  route: string;
  filters: Record<string, unknown>;
};

export type SiteListItem = SiteLite & {
  active: boolean;
  open_tasks: number;
  blocked_tasks: number;
  done_tasks: number;
  next_migration_date?: string | null;
  workstreams: string[];
  technology_summaries: Array<{
    key: string;
    label: string;
    total_tasks: number;
    open_tasks: number;
    blocked_tasks: number;
    done_tasks: number;
    owner_name?: string | null;
    peer_reviewer_name?: string | null;
  }>;
};

export type SiteDetailResponse = {
  site: SiteListItem;
  migration_windows: Array<{
    id: number;
    scheduled_date: string;
    start_time?: string | null;
    end_time?: string | null;
    status: string;
    change_ticket?: string | null;
    notes?: string | null;
    workstream?: WorkstreamLite | null;
  }>;
  task_groups: Array<{
    workstream?: WorkstreamLite | null;
    tasks: TaskRecord[];
  }>;
  updates: TaskUpdateRecord[];
  artifacts: Array<{
    id: number;
    artifact_type: string;
    name: string;
    url: string;
    notes?: string | null;
    created_at: string;
  }>;
  recent_changes: string[];
};

export type TaskUpdateRecord = {
  id: number;
  task_id: number;
  update_type: string;
  body: string;
  created_at: string;
  author?: UserLite | null;
};

export type CapacitySummary = {
  people: Array<{
    user: UserLite;
    open_tasks: number;
    blocked_tasks: number;
    overdue_tasks: number;
    assigned_sites: number;
    site_names: string[];
    site_summaries: string[];
    focus_sites: Array<{
      site_name: string;
      next_window?: string | null;
      open_tasks: number;
      pending_tasks: number;
      overdue_tasks: number;
      due_this_week: number;
    }>;
    workstreams: string[];
    due_this_week: number;
    pto: Array<{ start: string; end: string }>;
    weekly_hours: number;
    allocation_percent: number;
    load_label: string;
  }>;
  active_people_count: number;
  focus_site_count: number;
  overloaded_count: number;
  available_count: number;
  pto_this_week: number;
};

export type CalendarSummary = {
  events: Array<{
    id: string;
    type: string;
    title: string;
    start: string;
    end: string;
    owner?: UserLite | null;
    site?: SiteLite | null;
    workstream?: WorkstreamLite | null;
    notes?: string | null;
    status?: string | null;
  }>;
};

export type ImportRecord = {
  id: number;
  file_name: string;
  imported_at: string;
  imported_by?: UserLite | null;
  source_type: string;
  status: string;
  summary_json?: Record<string, unknown> | null;
  created_tasks: number;
  updated_tasks: number;
  warnings_count: number;
  errors_count: number;
};

export type ImportDetailResponse = ImportRecord & {
  errors: Array<{
    id: number;
    sheet_name: string;
    row_number?: number | null;
    field_name?: string | null;
    severity: string;
    message: string;
    raw_row_json?: Record<string, unknown> | null;
  }>;
};

export type SiteCreateInput = {
  site_code?: string | null;
  site_name: string;
  region: string;
  market: string;
  migration_wave?: string | null;
  notes?: string | null;
  scheduled_date: string;
  workstream: string;
  owner_id?: number | null;
  sdwan_owner_id?: number | null;
  sda_owner_id?: number | null;
  wireless_owner_id?: number | null;
};

export type SitePatchInput = {
  scheduled_date?: string | null;
  active?: boolean | null;
  notes?: string | null;
};

export type SiteAiReportType = "go_no_go" | "executive" | "status_update";

export type AiModelOption = {
  id: string;
  label: string;
  vendor: string;
  is_default: boolean;
};

export type SiteAiReportResponse = {
  site_id: number;
  site_name: string;
  model: string;
  report_type: SiteAiReportType;
  generated_at: string;
  headline: string;
  strapline?: string | null;
  overall_status: string;
  confidence: string;
  executive_summary: string;
  key_strengths: string[];
  key_risks: string[];
  recommended_actions: string[];
  technology_snapshots: Array<{
    workstream_name: string;
    status: string;
    summary: string;
    next_step: string;
  }>;
  evidence: string[];
  raw_text?: string | null;
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
};

export type AiReportUsageSummary = {
  actor_label: string;
  actor_source: string;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  recent_runs: Array<{
    id: number;
    actor_label: string;
    actor_source: string;
    site_id: number;
    site_name: string;
    model: string;
    report_type: SiteAiReportType;
    status: string;
    created_at: string;
    error_message?: string | null;
  }>;
};

// ── Ops / Health ──────────────────────────────────────────────────────────────

export type HealthBreakdown = {
  completion_pct: number;
  timeliness_pct: number;
  readiness_pct: number;
  coverage_pct: number;
};

export type SiteHealthScore = {
  site_id: number;
  site_code: string;
  site_name: string;
  score: number;
  grade: string;
  grade_color: string; // green / lime / yellow / orange / red
  label: string;       // "On Track" / "Good" / "Watch" / "At Risk" / "Critical"
  breakdown: HealthBreakdown;
  next_window_date?: string | null;
};

export type VelocityEstimate = {
  site_id: number;
  site_name: string;
  total_tasks: number;
  done_tasks: number;
  remaining_tasks: number;
  velocity_per_week: number;
  estimated_completion_date?: string | null;
  next_window_date?: string | null;
  days_until_window?: number | null;
  on_track: boolean;
  confidence: string; // HIGH / MEDIUM / LOW / INSUFFICIENT_DATA
};

export type TriageDriverTask = {
  task_id: number;
  workstream_name?: string | null;
  phase?: string | null;
  title: string;
  status_label: string;
  priority_label: string;
  owner_name?: string | null;
  due_date?: string | null;
  days_overdue: number;
};

export type MilestoneDetail = {
  label: string;
  order: number;
  total: number;
  done: number;
  status: string; // "done" | "current" | "late" | "future"
};

export type TriageTechnologyReadiness = {
  workstream_key: string;
  workstream_name: string;
  t2_due_total: number;
  t2_done_total: number;
  t2_open_total: number;
  t2_status: string;
  peer_review_total: number;
  peer_review_done_total: number;
  peer_review_open_total: number;
  peer_review_status: string;
  current_milestone?: string | null;
  expected_milestone?: string | null;
  milestones_behind: number;
  milestone_detail: MilestoneDetail[];
};

export type TriageSiteSummary = {
  site_id: number;
  site_name: string;
  site_code: string;
  region: string;
  next_window_date?: string | null;
  next_window_status?: string | null;
  days_until_window?: number | null;
  window_bucket: string;
  health_score: number;
  health_grade: string;
  open_tasks: number;
  critical_tasks: number;
  overdue_tasks: number;
  overdue_high_tasks: number;
  due_this_week_tasks: number;
  t2_open_total: number;
  t2_open_workstreams: number;
  peer_review_blocked_workstreams: number;
  owner_gap_workstreams: number;
  days_since_activity?: number | null;
  urgency_score: number;
  reasons: string[];
  technology_readiness: TriageTechnologyReadiness[];
  drivers: TriageDriverTask[];
  forecast: string; // "go" | "at_risk" | "no_go"
  forecast_color: string; // "emerald" | "amber" | "rose"
  top_blocker?: string | null;
  runway_summary?: string | null;
};

export type UserRecord = UserLite & {
  active: boolean;
  open_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
  due_this_week: number;
  assigned_sites: number;
  site_names: string[];
  workstreams: string[];
  attention_sites: Array<{
    site_name: string;
    next_window?: string | null;
    overdue_tasks: number;
    due_this_week: number;
    overdue_task_titles: string[];
    due_this_week_task_titles: string[];
  }>;
  current_pto: Array<{ start: string; end: string }>;
};
