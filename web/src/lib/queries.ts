"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";
import type {
  AiModelOption,
  AiReportUsageSummary,
  CalendarSummary,
  CapacitySummary,
  DashboardSummary,
  ImportDetailResponse,
  ImportRecord,
  SiteAiReportResponse,
  SiteAiReportType,
  SiteCreateInput,
  SiteDetailResponse,
  SiteHealthScore,
  SiteListItem,
  SitePatchInput,
  SystemView,
  TaskRecord,
  TaskUpdateRecord,
  TriageSiteSummary,
  UserRecord,
  VelocityEstimate,
} from "@/types/domain";

const keys = {
  dashboard: ["dashboard"] as const,
  sites: (params: string) => ["sites", params] as const,
  site: (id: string) => ["site", id] as const,
  tasks: (params: string) => ["tasks", params] as const,
  taskUpdates: (taskId: number | null) => ["task-updates", taskId] as const,
  users: ["users"] as const,
  assignableUsers: ["users", "assignable"] as const,
  capacity: ["capacity"] as const,
  calendar: ["calendar"] as const,
  imports: ["imports"] as const,
  systemViews: ["system-views"] as const,
  healthScores: ["health-scores"] as const,
  siteHealth: (id: number) => ["health", id] as const,
  siteVelocity: (id: number) => ["velocity", id] as const,
  triage: ["triage"] as const,
  aiModels: ["ai-models"] as const,
  aiUsage: ["ai-usage"] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => apiFetch<DashboardSummary>("/api/dashboard/summary"),
  });
}

export function useSites(params: URLSearchParams) {
  return useQuery({
    queryKey: keys.sites(params.toString()),
    queryFn: () => apiFetch<SiteListItem[]>(`/api/sites${params.toString() ? `?${params.toString()}` : ""}`),
  });
}

export function useSite(id: string) {
  return useQuery({
    queryKey: keys.site(id),
    queryFn: () => apiFetch<SiteDetailResponse>(`/api/sites/${id}`),
    enabled: Boolean(id),
  });
}

export function useTasks(params: URLSearchParams) {
  return useQuery({
    queryKey: keys.tasks(params.toString()),
    queryFn: () => apiFetch<TaskRecord[]>(`/api/tasks${params.toString() ? `?${params.toString()}` : ""}`),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: () => apiFetch<UserRecord[]>("/api/users"),
  });
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: keys.assignableUsers,
    queryFn: () => apiFetch<UserRecord[]>("/api/users?include_empty=true"),
  });
}

export function useTaskUpdates(taskId: number | null) {
  return useQuery({
    queryKey: keys.taskUpdates(taskId),
    queryFn: () => apiFetch<TaskUpdateRecord[]>(`/api/task-updates?task_id=${taskId}`),
    enabled: typeof taskId === "number",
  });
}

export function useCapacity() {
  return useQuery({
    queryKey: keys.capacity,
    queryFn: () => apiFetch<CapacitySummary>("/api/capacity"),
  });
}

export function useCalendar() {
  return useQuery({
    queryKey: keys.calendar,
    queryFn: () => apiFetch<CalendarSummary>("/api/calendar"),
  });
}

export function useImports() {
  return useQuery({
    queryKey: keys.imports,
    queryFn: () => apiFetch<ImportRecord[]>("/api/imports"),
  });
}

export function useSystemViews() {
  return useQuery({
    queryKey: keys.systemViews,
    queryFn: () => apiFetch<SystemView[]>("/api/views/system"),
  });
}

export function usePatchTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiFetch<TaskRecord>(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-updates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SiteCreateInput) =>
      apiFetch<SiteDetailResponse>("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.setQueryData(keys.site(String(result.site.id)), result);
    },
  });
}

export function usePatchSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: SitePatchInput }) =>
      apiFetch<SiteDetailResponse>(`/api/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.setQueryData(keys.site(String(result.site.id)), result);
    },
  });
}

export function useAssignSitePeerReviewer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      siteId,
      workstream,
      reviewerId,
    }: {
      siteId: number;
      workstream: string;
      reviewerId: number | null;
    }) =>
      apiFetch<SiteDetailResponse>(`/api/sites/${siteId}/peer-reviewer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workstream,
          reviewer_id: reviewerId,
        }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.setQueryData(keys.site(String(result.site.id)), result);
    },
  });
}

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiFetch<TaskRecord[]>("/api/tasks/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-updates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
}

export function useHealthScores() {
  return useQuery({
    queryKey: keys.healthScores,
    queryFn: () => apiFetch<SiteHealthScore[]>("/api/health-scores"),
  });
}

export function useSiteHealth(siteId: number) {
  return useQuery({
    queryKey: keys.siteHealth(siteId),
    queryFn: () => apiFetch<SiteHealthScore>(`/api/health/${siteId}`),
    enabled: siteId > 0,
  });
}

export function useSiteVelocity(siteId: number) {
  return useQuery({
    queryKey: keys.siteVelocity(siteId),
    queryFn: () => apiFetch<VelocityEstimate>(`/api/velocity/${siteId}`),
    enabled: siteId > 0,
  });
}

export function useTriageSites() {
  return useQuery({
    queryKey: keys.triage,
    queryFn: () => apiFetch<TriageSiteSummary[]>("/api/triage"),
    refetchInterval: 60_000,
  });
}

export function useAiReportModels() {
  return useQuery({
    queryKey: keys.aiModels,
    queryFn: () => apiFetch<AiModelOption[]>("/api/ai/models"),
    staleTime: 300_000,
  });
}

export function useAiUsageSummary() {
  return useQuery({
    queryKey: keys.aiUsage,
    queryFn: () => apiFetch<AiReportUsageSummary>("/api/ai/usage"),
    staleTime: 30_000,
  });
}

export function useGenerateSiteAiReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      siteId,
      model,
      reportType,
    }: {
      siteId: number;
      model: string;
      reportType: SiteAiReportType;
    }) =>
      apiFetch<SiteAiReportResponse>(`/api/ai/site-reports/${siteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          report_type: reportType,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.aiUsage });
    },
  });
}

export function useUploadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<{ job_id: string; status: string }>("/api/imports", { method: "POST", body: form });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
  });
}
