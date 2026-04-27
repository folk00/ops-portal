"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import type { CellValueChangedEvent, GridApi } from "ag-grid-community";
import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/data-display/empty-state";
import { QuickPeekSheet } from "@/components/data-display/quick-peek-sheet";
import { FilterBar } from "@/components/shell/filter-bar";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-client";
import { useAssignableUsers, useAssignSitePeerReviewer, useBulkUpdateTasks, usePatchSite, usePatchTask, useSites, useTasks } from "@/lib/queries";
import type { TaskRecord } from "@/types/domain";
import {
  TrackerGrid,
  type TrackerMatrixCell,
  type TrackerMatrixRow,
  type TrackerMatrixSite,
  type TrackerViewMode,
} from "@/features/tracker/tracker-grid";

const WORKSTREAM_TABS = [
  { key: "SDWAN", label: "SD-WAN", description: "Workbook matrix for SD-WAN readiness, peer review, and implementation tasks." },
  { key: "SDA", label: "SDA", description: "Workbook matrix for SDA planning, pre-staging, endpoint validation, and peer review." },
  { key: "WIRELESS", label: "Wireless", description: "Workbook matrix for wireless planning, RF, and execution tasks." },
] as const;

const PRIMARY_TRACKER_TAB: Record<(typeof WORKSTREAM_TABS)[number]["key"], string> = {
  SDWAN: "SD-WAN Tracker",
  SDA: "SDA Tracker",
  WIRELESS: "Wireless Tracker",
};

const WIRELESS_REFERENCE_MARKERS = [
  "internal communication for queries",
  "point of contact",
  "rf design discrepancies",
  "remediation survey report discrepancies",
  "survey report discrepancies",
  "enclosures confirmation",
] as const;

function normalizeWorkstreamParam(value: string | null): (typeof WORKSTREAM_TABS)[number]["key"] | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z]/g, "") || "";
  if (normalized === "SDWAN") return "SDWAN";
  if (normalized === "SDA") return "SDA";
  if (normalized === "WIRELESS") return "WIRELESS";
  return null;
}

function implementationMonthKey(value?: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function implementationDateTime(value?: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed).getTime();
}

function chooseTrackerImplementationDate(
  currentValue: string | null | undefined,
  candidateValue: string | null | undefined,
  todayTime: number,
) {
  if (!candidateValue) return currentValue || null;
  if (!currentValue) return candidateValue;

  const currentTime = implementationDateTime(currentValue);
  const candidateTime = implementationDateTime(candidateValue);
  if (candidateTime == null) return currentValue;
  if (currentTime == null) return candidateValue;

  const currentIsFuture = currentTime >= todayTime;
  const candidateIsFuture = candidateTime >= todayTime;

  if (candidateIsFuture !== currentIsFuture) {
    return candidateIsFuture ? candidateValue : currentValue;
  }

  if (candidateIsFuture) {
    return candidateTime < currentTime ? candidateValue : currentValue;
  }

  return candidateTime > currentTime ? candidateValue : currentValue;
}

function formatMonthScopeLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const parsed = new Date(Number(year), Number(month) - 1, 1);
  return format(parsed, "MMM yyyy");
}

function fixedImplementationMonthGroups() {
  const groups: Array<{ year: string; options: Array<{ value: string; label: string }> }> = [];
  for (let year = 2026; year <= 2028; year += 1) {
    const startMonth = year === 2026 ? 3 : 1;
    const options: Array<{ value: string; label: string }> = [];
    for (let month = startMonth; month <= 12; month += 1) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      options.push({
        value: `month:${monthKey}`,
        label: formatMonthScopeLabel(monthKey),
      });
    }
    groups.push({ year: String(year), options });
  }
  return groups;
}

function siteOptionLabel(site: TrackerMatrixSite) {
  if (!site.implementationDate) return `${site.siteName} | TBD`;
  return `${site.siteName} | ${format(parseISO(site.implementationDate), "MMM d, yyyy")}`;
}

function compareMonthKeys(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function parseRowOrder(task: TaskRecord) {
  const rowMatch = task.source_row_key?.match(/row-(\d+)/i);
  if (rowMatch) return Number(rowMatch[1]);
  return task.timeline_order * 1000 + task.id;
}

function parseColumnOrder(task: TaskRecord) {
  const columnMatch = task.source_column_key?.match(/\(([A-Z]+)\)\s*$/);
  if (!columnMatch) return Number.MAX_SAFE_INTEGER;
  let total = 0;
  for (const char of columnMatch[1]) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return total;
}

function buildMatrixCell(task: TaskRecord): TrackerMatrixCell {
  return {
    task,
    statusValue: task.status.value,
    noteValue: task.note_preview || (task.is_pristine_seed ? "" : task.description || ""),
    peerReviewValue: task.peer_review_preview || "",
    peerReviewAuthorName: task.peer_review_author?.name || null,
  };
}

function isPeerReviewTask(task: TaskRecord) {
  return /peer review/i.test(`${task.phase || ""} ${task.title || ""}`);
}

function normalizeTrackerText(...values: Array<string | null | undefined>) {
  return values
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wirelessReferenceKey(task: TaskRecord) {
  return normalizeTrackerText(task.phase || "", task.title, task.description || "");
}

function isWirelessReferenceTask(task: TaskRecord) {
  if ((task.workstream?.key || "").toUpperCase().replace(/[^A-Z0-9]/g, "") !== "WIRELESS") return false;
  const haystack = normalizeTrackerText(task.phase || "", task.title || "");
  return WIRELESS_REFERENCE_MARKERS.some((marker) => haystack.includes(marker));
}

export function TrackerPage() {
  const searchParams = useSearchParams();
  const requestedWorkstream = normalizeWorkstreamParam(searchParams.get("workstream")) || "SDWAN";
  const requestedSiteId = searchParams.get("site_id") || "";
  const rawRequestedMonthScope = searchParams.get("month_scope") || "";
  const requestedMonthScope =
    rawRequestedMonthScope === "all" ||
    rawRequestedMonthScope === "past" ||
    rawRequestedMonthScope.startsWith("month:")
      ? rawRequestedMonthScope
      : "current";
  const [search, setSearch] = useState("");
  const [workstream, setWorkstream] = useState<(typeof WORKSTREAM_TABS)[number]["key"]>(requestedWorkstream);
  const [viewMode, setViewMode] = useState<TrackerViewMode>("execution");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [monthScope, setMonthScope] = useState(requestedMonthScope);
  const [focusSiteId, setFocusSiteId] = useState(requestedSiteId);
  const [timelineSiteId, setTimelineSiteId] = useState(requestedSiteId);
  const [quickAssignSiteId, setQuickAssignSiteId] = useState(requestedSiteId);
  const [siteOwnerId, setSiteOwnerId] = useState("");
  const [peerReviewerId, setPeerReviewerId] = useState("");
  const [implementationDateDraft, setImplementationDateDraft] = useState("");
  const [peekTask, setPeekTask] = useState<TaskRecord | null>(null);
  const [gridApi, setGridApi] = useState<GridApi<TrackerMatrixRow> | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    setWorkstream(requestedWorkstream);
  }, [requestedWorkstream]);

  useEffect(() => {
    setFocusSiteId(requestedSiteId);
  }, [requestedSiteId]);

  useEffect(() => {
    setTimelineSiteId(requestedSiteId);
  }, [requestedSiteId]);

  useEffect(() => {
    setQuickAssignSiteId(requestedSiteId);
  }, [requestedSiteId]);

  useEffect(() => {
    setMonthScope(requestedMonthScope);
  }, [requestedMonthScope]);

  const params = useMemo(() => {
    const next = new URLSearchParams();
    next.set("workstream", workstream);
    if (ownerFilter && viewMode === "execution") next.set("owner_id", ownerFilter);
    return next;
  }, [ownerFilter, viewMode, workstream]);
  const siteScopeParams = useMemo(() => {
    const next = new URLSearchParams();
    next.set("workstream", workstream);
    next.set("active", "true");
    return next;
  }, [workstream]);
  const referenceParams = useMemo(() => {
    const next = new URLSearchParams();
    next.set("workstream", workstream);
    next.set("reference_only", "true");
    if (focusSiteId) next.set("site_id", focusSiteId);
    return next;
  }, [focusSiteId, workstream]);

  const { data: tasks = [], isLoading } = useTasks(params);
  const { data: referenceTasks = [] } = useTasks(referenceParams);
  const { data: assignableUserRecords = [] } = useAssignableUsers();
  const { data: siteScope = [] } = useSites(siteScopeParams);
  const patchTask = usePatchTask();
  const patchSite = usePatchSite();
  const bulkUpdateTasks = useBulkUpdateTasks();
  const assignPeerReviewer = useAssignSitePeerReviewer();
  const activeTab = WORKSTREAM_TABS.find((tab) => tab.key === workstream) || WORKSTREAM_TABS[0];
  const todayTime = today.getTime();
  const monthScopeLabel = "Today forward";
  const siteScopeIds = useMemo(() => new Set(siteScope.map((site) => site.id)), [siteScope]);
  const siteScopeMap = useMemo(() => new Map(siteScope.map((site) => [site.id, site])), [siteScope]);
  const implementationMonthGroups = useMemo(() => fixedImplementationMonthGroups(), []);

  const { rows, sites } = useMemo(() => {
    const trackerTasks = tasks.filter(
      (task) => task.source_tab === PRIMARY_TRACKER_TAB[workstream] && !(workstream === "WIRELESS" && isWirelessReferenceTask(task)),
    );
    const rowMap = new Map<string, TrackerMatrixRow>();
    const siteMap = new Map<number, TrackerMatrixSite & { columnOrder: number; fallbackImplementationDate?: string | null }>();

    for (const task of trackerTasks) {
      const rowKey = `${task.source_tab || workstream}:${task.source_row_key || `${task.phase || ""}:${task.title}`}`;
      const siteId = task.site.id;
      const scopedSite = siteScopeMap.get(siteId);
      const existingSite = siteMap.get(siteId);
      const nextColumnOrder = parseColumnOrder(task);
      const trackerImplementationDate = task.implementation_date || null;
      if (!existingSite || nextColumnOrder < existingSite.columnOrder) {
        const technologySummary = scopedSite?.technology_summaries.find((summary) => summary.key === workstream);
        siteMap.set(siteId, {
          id: siteId,
          siteCode: task.site.site_code,
          siteName: task.site.site_name,
          implementationDate: trackerImplementationDate,
          fallbackImplementationDate: scopedSite?.next_migration_date || null,
          siteEngineer: task.owner?.name || task.site_engineer || null,
          peerReviewer: technologySummary?.peer_reviewer_name || null,
          columnOrder: nextColumnOrder,
        });
      } else {
        existingSite.implementationDate = chooseTrackerImplementationDate(existingSite.implementationDate, trackerImplementationDate, todayTime);
      }

      const existingRow = rowMap.get(rowKey);
      if (!existingRow) {
        rowMap.set(rowKey, {
          rowKey,
          rowOrder: parseRowOrder(task),
          timelineLabel: task.timeline_label,
          phase: task.phase || "Unspecified",
          taskTitle: task.title,
          isPeerReview: isPeerReviewTask(task),
          cells: { [siteId]: buildMatrixCell(task) },
        });
      } else {
        existingRow.rowOrder = Math.min(existingRow.rowOrder, parseRowOrder(task));
        existingRow.isPeerReview = existingRow.isPeerReview || isPeerReviewTask(task);
        existingRow.cells[siteId] = buildMatrixCell(task);
      }
    }

    let matrixRows = Array.from(rowMap.values()).sort(
      (left, right) =>
        left.rowOrder - right.rowOrder ||
        left.timelineLabel.localeCompare(right.timelineLabel) ||
        left.phase.localeCompare(right.phase) ||
        left.taskTitle.localeCompare(right.taskTitle),
    );

    const allMatrixSites = Array.from(siteMap.values())
      .sort((left, right) => {
        const leftMonth = implementationMonthKey(left.implementationDate);
        const rightMonth = implementationMonthKey(right.implementationDate);
        const leftTime = implementationDateTime(left.implementationDate);
        const rightTime = implementationDateTime(right.implementationDate);
        const leftBucket = leftTime == null || leftTime >= todayTime ? 0 : 1;
        const rightBucket = rightTime == null || rightTime >= todayTime ? 0 : 1;
        return (
          leftBucket - rightBucket ||
          (leftTime ?? Number.MAX_SAFE_INTEGER) - (rightTime ?? Number.MAX_SAFE_INTEGER) ||
          compareMonthKeys(leftMonth, rightMonth) ||
          left.columnOrder - right.columnOrder ||
          left.siteName.localeCompare(right.siteName)
        );
      })
      .filter((site) => siteScopeIds.has(site.id))
      .map(({ columnOrder: _columnOrder, fallbackImplementationDate, ...site }) => ({
        ...site,
        implementationDate: site.implementationDate || fallbackImplementationDate || null,
      }));
    const selectedId = focusSiteId ? Number(focusSiteId) : null;
    let matrixSites = allMatrixSites.filter((site) => {
      const siteTime = implementationDateTime(site.implementationDate);
      const siteMonth = implementationMonthKey(site.implementationDate);
      if (selectedId && site.id === selectedId) return true;
      if (monthScope === "all") return true;
      if (monthScope === "past") return siteTime != null && siteTime < todayTime;
      if (monthScope.startsWith("month:")) {
        const selectedMonth = monthScope.slice("month:".length);
        if (!siteMonth || siteMonth !== selectedMonth || siteTime == null) return false;
        return true;
      }
      return siteTime == null || siteTime >= todayTime;
    });

    if (ownerFilter && viewMode === "peer-review") {
      const reviewerName = assignableUserRecords.find((user) => String(user.id) === ownerFilter)?.name || "";
      if (reviewerName) {
        const allowedSiteIds = new Set(
          matrixSites
            .filter((site) => {
              const scopedSite = siteScopeMap.get(site.id);
              const technologySummary = scopedSite?.technology_summaries.find((summary) => summary.key === workstream);
              return technologySummary?.peer_reviewer_name === reviewerName;
            })
            .map((site) => site.id),
        );
        matrixSites = matrixSites.filter((site) => allowedSiteIds.has(site.id));
        matrixRows = matrixRows
          .filter((row) => Object.keys(row.cells).some((siteId) => allowedSiteIds.has(Number(siteId))))
          .map((row) => ({
            ...row,
            cells: Object.fromEntries(Object.entries(row.cells).filter(([siteId]) => allowedSiteIds.has(Number(siteId)))),
          }));
      }
    }

    if (selectedId) {
      matrixRows = matrixRows
        .filter((row) => Boolean(row.cells[selectedId]))
        .map((row) => ({
          ...row,
          cells: row.cells[selectedId] ? { [selectedId]: row.cells[selectedId] } : {},
        }));
      matrixSites = matrixSites.filter((site) => site.id === selectedId);
    } else {
      const allowedSiteIds = new Set(matrixSites.map((site) => site.id));
      matrixRows = matrixRows
        .filter((row) => Object.keys(row.cells).some((siteId) => allowedSiteIds.has(Number(siteId))))
        .map((row) => ({
          ...row,
          cells: Object.fromEntries(Object.entries(row.cells).filter(([siteId]) => allowedSiteIds.has(Number(siteId)))),
        }));
    }

    const needle = search.trim().toLowerCase();
    if (!needle) {
      return { rows: matrixRows, sites: matrixSites };
    }

    const siteMatches = matrixSites.filter(
      (site) => site.siteName.toLowerCase().includes(needle) || site.siteCode.toLowerCase().includes(needle),
    );

    if (siteMatches.length) {
      const allowedSiteIds = new Set(siteMatches.map((site) => site.id));
      matrixRows = matrixRows
        .filter((row) => Object.keys(row.cells).some((siteId) => allowedSiteIds.has(Number(siteId))))
        .map((row) => ({
          ...row,
          cells: Object.fromEntries(
            Object.entries(row.cells).filter(([siteId]) => allowedSiteIds.has(Number(siteId))),
          ),
        }));
      matrixSites = siteMatches;
      return { rows: matrixRows, sites: matrixSites };
    }

    matrixRows = matrixRows.filter(
      (row) =>
        row.timelineLabel.toLowerCase().includes(needle) ||
        row.phase.toLowerCase().includes(needle) ||
        row.taskTitle.toLowerCase().includes(needle) ||
        Object.values(row.cells).some(
          (cell) =>
            cell.noteValue.toLowerCase().includes(needle) ||
            cell.peerReviewValue.toLowerCase().includes(needle) ||
            cell.task.owner?.name?.toLowerCase().includes(needle) ||
            cell.task.site.site_name.toLowerCase().includes(needle) ||
            cell.task.site.site_code.toLowerCase().includes(needle),
        ),
    );

    return { rows: matrixRows, sites: matrixSites };
  }, [assignableUserRecords, focusSiteId, monthScope, ownerFilter, search, siteScopeIds, siteScopeMap, tasks, todayTime, viewMode, workstream]);

  const activeSite = (focusSiteId ? sites.find((site) => site.id === Number(focusSiteId)) : sites.length === 1 ? sites[0] : null) || null;
  const activeSiteId = activeSite?.id || (sites.length === 1 ? sites[0].id : null);
  const activeTimelineSite =
    (timelineSiteId ? sites.find((site) => site.id === Number(timelineSiteId)) : null) ||
    activeSite ||
    (sites.length ? sites[0] : null);
  const activeTimelineSiteId = activeTimelineSite?.id || null;
  const quickAssignSites = useMemo(() => sites, [sites]);
  const wirelessReferenceItems = useMemo(() => {
    if (workstream !== "WIRELESS") return [];

    const needle = search.trim().toLowerCase();
    const referenceSource = referenceTasks.length ? referenceTasks : tasks.filter(isWirelessReferenceTask);
    const deduped = new Map<
      string,
      {
        task: TaskRecord;
        rowOrder: number;
      }
    >();

    for (const task of referenceSource) {
      if (
        needle &&
        ![
          task.phase || "",
          task.title,
          task.description || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ) {
        continue;
      }
      const key = wirelessReferenceKey(task);
      const nextRowOrder = parseRowOrder(task);
      const existing = deduped.get(key);
      if (!existing || nextRowOrder < existing.rowOrder) {
        deduped.set(key, { task, rowOrder: nextRowOrder });
      }
    }

    return Array.from(deduped.values())
      .sort(
        (left, right) =>
          left.rowOrder - right.rowOrder ||
          (left.task.phase || "").localeCompare(right.task.phase || "") ||
          left.task.title.localeCompare(right.task.title),
      )
      .map((item) => item.task);
  }, [referenceTasks, search, tasks, workstream]);
  const quickAssignSite =
    (quickAssignSiteId ? quickAssignSites.find((site) => site.id === Number(quickAssignSiteId)) : null) ||
    activeSite ||
    (quickAssignSites.length === 1 ? quickAssignSites[0] : null);
  const assignableUsers = useMemo(
    () => assignableUserRecords.filter((item) => item.id != null),
    [assignableUserRecords],
  );
  const quickAssignCurrentOwnerId = useMemo(() => {
    const selectedSiteId = quickAssignSite?.id || null;
    if (!selectedSiteId) return "";
    for (const row of rows) {
      const ownerId = row.cells[selectedSiteId]?.task.owner?.id;
      if (ownerId) return String(ownerId);
    }
    return "";
  }, [quickAssignSite, rows]);

  const quickAssignCurrentPeerReviewerId = useMemo(() => {
    const selectedSiteId = quickAssignSite?.id || null;
    if (!selectedSiteId) return "";
    const scopedSite = siteScopeMap.get(selectedSiteId);
    const reviewerName = scopedSite?.technology_summaries.find((summary) => summary.key === workstream)?.peer_reviewer_name;
    if (!reviewerName) return "";
    const match = assignableUsers.find((user) => user.name === reviewerName);
    return match?.id ? String(match.id) : "";
  }, [assignableUsers, quickAssignSite, siteScopeMap, workstream]);

  useEffect(() => {
    if (!quickAssignSiteId && activeSite) {
      setQuickAssignSiteId(String(activeSite.id));
      return;
    }
    if (quickAssignSiteId && !quickAssignSites.some((site) => site.id === Number(quickAssignSiteId))) {
      setQuickAssignSiteId(activeSite ? String(activeSite.id) : "");
    }
  }, [activeSite, quickAssignSiteId, quickAssignSites]);

  useEffect(() => {
    if (focusSiteId && sites.some((site) => site.id === Number(focusSiteId))) {
      setTimelineSiteId(focusSiteId);
      return;
    }

    if (timelineSiteId && sites.some((site) => site.id === Number(timelineSiteId))) {
      return;
    }

    setTimelineSiteId(sites[0] ? String(sites[0].id) : "");
  }, [focusSiteId, sites, timelineSiteId]);

  useEffect(() => {
    setSiteOwnerId(quickAssignCurrentOwnerId);
  }, [quickAssignCurrentOwnerId, quickAssignSite?.id]);

  useEffect(() => {
    setPeerReviewerId(quickAssignCurrentPeerReviewerId);
  }, [quickAssignCurrentPeerReviewerId, quickAssignSite?.id]);

  useEffect(() => {
    setImplementationDateDraft(quickAssignSite?.implementationDate || "");
  }, [quickAssignSite?.id, quickAssignSite?.implementationDate]);

  const onCellValueChange = async (event: CellValueChangedEvent<TrackerMatrixRow>) => {
    if (!event.data || event.newValue === event.oldValue) return;
    const [kind, siteIdRaw] = (event.colDef.colId || "").split(":");
    const siteId = Number(siteIdRaw);
    const cell = event.data.cells[siteId];
    if (!cell) return;

    const payload: Record<string, unknown> = {};
    if (kind === "status") payload.status = event.newValue;
    if (kind === "note") payload.description = String(event.newValue || "");
    if (!Object.keys(payload).length) return;

    try {
      const updated = await patchTask.mutateAsync({ id: cell.task.id, payload });
      event.data.cells[siteId] = buildMatrixCell(updated);
      if (peekTask?.id === updated.id) setPeekTask(updated);
      event.api.refreshCells({ rowNodes: [event.node], force: true });
      event.api.redrawRows({ rowNodes: [event.node] });
      toast.success(kind === "note" ? "Task note updated" : "Task status updated");
    } catch (error) {
      event.data.cells[siteId] = buildMatrixCell(cell.task);
      event.api.refreshCells({ rowNodes: [event.node], force: true });
      event.api.redrawRows({ rowNodes: [event.node] });
      toast.error(error instanceof Error ? error.message : "Task update failed");
    }
  };

  const onInlineNoteSave = async (row: TrackerMatrixRow, siteId: number, value: string) => {
    const cell = row.cells[siteId];
    if (!cell) return;

    try {
      const updated = await patchTask.mutateAsync({
        id: cell.task.id,
        payload: {
          comment: value,
        },
      });
      row.cells[siteId] = buildMatrixCell(updated);
      if (peekTask?.id === updated.id) setPeekTask(updated);
      gridApi?.refreshCells({ force: true });
      gridApi?.redrawRows();
      toast.success("Task note updated");
    } catch (error) {
      gridApi?.refreshCells({ force: true });
      toast.error(error instanceof Error ? error.message : "Task update failed");
      throw error;
    }
  };

  const onInlineStatusSave = async (row: TrackerMatrixRow, siteId: number, value: string) => {
    const cell = row.cells[siteId];
    if (!cell || value === cell.statusValue) return;

    try {
      const updated = await patchTask.mutateAsync({
        id: cell.task.id,
        payload: { status: value },
      });
      row.cells[siteId] = buildMatrixCell(updated);
      if (peekTask?.id === updated.id) setPeekTask(updated);
      gridApi?.refreshCells({ force: true });
      gridApi?.redrawRows();
      toast.success("Task status updated");
    } catch (error) {
      gridApi?.refreshCells({ force: true });
      toast.error(error instanceof Error ? error.message : "Task update failed");
      throw error;
    }
  };

  const onInlinePeerReviewSave = async (row: TrackerMatrixRow, siteId: number, value: string) => {
    const cell = row.cells[siteId];
    if (!cell) return;

    if (!peerReviewerId) {
      const error = new Error("Choose a peer reviewer first.");
      toast.error(error.message);
      throw error;
    }

    try {
      const updated = await patchTask.mutateAsync({
        id: cell.task.id,
        payload: {
          peer_review_comment: value,
          peer_review_author_id: Number(peerReviewerId),
        },
      });
      row.cells[siteId] = buildMatrixCell(updated);
      if (peekTask?.id === updated.id) setPeekTask(updated);
      gridApi?.refreshCells({ force: true });
      gridApi?.redrawRows();
      toast.success("Peer review saved");
    } catch (error) {
      gridApi?.refreshCells({ force: true });
      toast.error(error instanceof Error ? error.message : "Peer review update failed");
      throw error;
    }
  };

  const assignPeerReviewerToSite = async () => {
    if (!quickAssignSite || !peerReviewerId) return;

    try {
      await assignPeerReviewer.mutateAsync({
        siteId: quickAssignSite.id,
        workstream,
        reviewerId: Number(peerReviewerId),
      });
      const reviewerName = assignableUsers.find((user) => String(user.id) === peerReviewerId)?.name || "Selected reviewer";
      toast.success(`${reviewerName} assigned as peer reviewer for ${quickAssignSite.siteName} (${activeTab.label}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign peer reviewer");
    }
  };

  const openSiteMode = (siteId: number, nextMode: TrackerViewMode) => {
    setFocusSiteId(String(siteId));
    setQuickAssignSiteId(String(siteId));
    setViewMode(nextMode);
  };

  const assignOwnerToActiveSite = async () => {
    if (!quickAssignSite || !siteOwnerId) return;

    try {
      const siteTasks = await apiFetch<TaskRecord[]>(
        `/api/tasks?workstream=${workstream}&site_id=${quickAssignSite.id}`,
      );
      const taskIds = Array.from(
        new Set(
          siteTasks
            .filter((task) => task.source_tab === PRIMARY_TRACKER_TAB[workstream])
            .map((task) => task.id),
        ),
      );

      if (!taskIds.length) {
        toast.error("No tracker tasks found for this site in the selected technology.");
        return;
      }

      await bulkUpdateTasks.mutateAsync({
        task_ids: taskIds,
        owner_id: Number(siteOwnerId),
      });

      const ownerName = assignableUsers.find((user) => String(user.id) === siteOwnerId)?.name || "Selected owner";
      toast.success(`${ownerName} assigned to ${quickAssignSite.siteName} (${activeTab.label}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign site owner");
    }
  };

  const saveImplementationDate = async () => {
    if (!quickAssignSite) {
      toast.error("Choose a site first.");
      return;
    }

    if (!implementationDateDraft) {
      toast.error("Choose an implementation date first.");
      return;
    }

    try {
      await patchSite.mutateAsync({
        id: quickAssignSite.id,
        payload: { scheduled_date: implementationDateDraft },
      });
      toast.success(`Implementation date updated for ${quickAssignSite.siteName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update implementation date");
    }
  };

  const handleFocusSiteChange = (value: string) => {
    setFocusSiteId(value);
    if (value) {
      setTimelineSiteId(value);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        className="space-y-2"
        title="Tracker"
        subtitle={
          viewMode === "peer-review"
            ? `${activeTab.description} Peer review mode mirrors the same matrix but keeps reviewer comments separate from execution notes.`
            : `${activeTab.description} Steps stay fixed on the left and sites move horizontally, like the workbook.`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/sites">Add site</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => gridApi?.exportDataAsCsv({ fileName: `${workstream.toLowerCase()}-tracker-matrix.csv` })}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <Tabs value={workstream} onValueChange={(value) => setWorkstream(value as (typeof WORKSTREAM_TABS)[number]["key"])} className="space-y-3">
        <TabsList>
          {WORKSTREAM_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={viewMode === "execution" ? "default" : "outline"}
          onClick={() => setViewMode("execution")}
        >
          Execution view
        </Button>
        <Button
          size="sm"
          variant={viewMode === "peer-review" ? "default" : "outline"}
          className={viewMode === "peer-review" ? "border-orange-500 bg-orange-500 text-white hover:opacity-95" : "border-orange-200 text-orange-700 hover:bg-orange-50"}
          onClick={() => setViewMode("peer-review")}
        >
          Peer review view
        </Button>
      </div>

      <FilterBar className="gap-1.5 px-2.5 py-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a site, phase, task step, owner, or note"
          className="md:max-w-[21rem]"
        />
        <Select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="md:max-w-xs">
          <option value="">{viewMode === "peer-review" ? "All peer reviewers" : "All engineers"}</option>
          {assignableUsers.map((user) => (
            <option key={user.id} value={user.id ?? ""}>{user.name}</option>
          ))}
        </Select>
        <Select value={monthScope} onChange={(event) => setMonthScope(event.target.value)} className="md:max-w-xs">
          <option value="current">{monthScopeLabel}</option>
          <option value="past">Past sites only</option>
          <option value="all">All implementation months</option>
          {implementationMonthGroups.map((group) => (
            <optgroup key={group.year} label={group.year}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select value={focusSiteId} onChange={(event) => handleFocusSiteChange(event.target.value)} className="md:max-w-sm">
          <option value="">All visible sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>{siteOptionLabel(site)}</option>
          ))}
        </Select>
        {viewMode === "peer-review" ? (
          <div className="min-w-[290px] rounded-xl border border-orange-200 bg-orange-50/70 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-orange-700">
              Assign peer reviewer for visible site / tech
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Select
                value={quickAssignSiteId}
                onChange={(event) => setQuickAssignSiteId(event.target.value)}
                className="min-w-[190px] flex-1"
              >
                <option value="">Choose site</option>
                {quickAssignSites.map((site) => (
                  <option key={site.id} value={site.id}>{siteOptionLabel(site)}</option>
                ))}
              </Select>
              <Select
                value={peerReviewerId}
                onChange={(event) => setPeerReviewerId(event.target.value)}
                className="min-w-[190px] flex-1"
              >
                <option value="">Choose reviewer</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-100"
                onClick={() => void assignPeerReviewerToSite()}
                disabled={!quickAssignSite || !peerReviewerId || assignPeerReviewer.isPending}
              >
                {assignPeerReviewer.isPending ? "Assigning..." : "Assign peer reviewer"}
              </Button>
            </div>
            <div className="mt-1.5 text-[11px] leading-4 text-orange-800/80">
              {quickAssignSite
                ? `Peer review for ${quickAssignSite.siteName} in ${activeTab.label} stays separate from the execution note.`
                : "Choose a site and reviewer, then save peer review comments separately from the execution note."}
            </div>
          </div>
        ) : null}
        {viewMode === "execution" ? (
          <div className="min-w-[290px] rounded-xl border border-border bg-slate-50 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Quick assign for visible site / tech
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Select
                value={quickAssignSiteId}
                onChange={(event) => setQuickAssignSiteId(event.target.value)}
                className="min-w-[190px] flex-1"
              >
                <option value="">Choose site</option>
                {quickAssignSites.map((site) => (
                  <option key={site.id} value={site.id}>{siteOptionLabel(site)}</option>
                ))}
              </Select>
              <Select
                value={siteOwnerId}
                onChange={(event) => setSiteOwnerId(event.target.value)}
                className="min-w-[190px] flex-1"
                disabled={!quickAssignSite}
              >
                <option value="">{quickAssignSite ? "Choose engineer" : "Choose a site first"}</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                ))}
              </Select>
              <Button
                variant="secondary"
                onClick={() => void assignOwnerToActiveSite()}
                disabled={!quickAssignSite || !siteOwnerId || bulkUpdateTasks.isPending}
              >
                {bulkUpdateTasks.isPending ? "Assigning..." : "Assign site owner"}
              </Button>
            </div>
            {quickAssignSite ? (
              <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                Applies to <span className="font-medium text-slate-700">{quickAssignSite.siteName}</span> in <span className="font-medium text-slate-700">{activeTab.label}</span>.
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="min-w-[280px] rounded-xl border border-border bg-slate-50 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Implementation date in tracker
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={implementationDateDraft}
              onChange={(event) => setImplementationDateDraft(event.target.value)}
              className="min-w-[180px] flex-1"
              disabled={!quickAssignSite}
            />
            <Button
              variant="outline"
              onClick={() => void saveImplementationDate()}
              disabled={!quickAssignSite || !implementationDateDraft || patchSite.isPending}
            >
              {patchSite.isPending ? "Saving..." : "Save date"}
            </Button>
          </div>
          <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {quickAssignSite
              ? `Update ${quickAssignSite.siteName} here, including sites that still show TBD.`
              : "Choose a site above, then set any implementation day without leaving Tracker."}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-slate-50 px-2.5 py-1.5 text-[13px] text-muted-foreground">
          Visible steps: {rows.length} | Visible sites: {sites.length}
        </div>
        {activeSite ? (
          <div className="rounded-xl border border-border bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-700">
            {viewMode === "peer-review"
              ? activeSite.peerReviewer
                ? `${activeSite.peerReviewer} | `
                : "Peer reviewer unassigned | "
              : activeSite.siteEngineer
                ? `${activeSite.siteEngineer} | `
                : ""}
            Impl: {activeSite.implementationDate ? format(parseISO(activeSite.implementationDate), "PPP") : "TBD"}
          </div>
        ) : null}
        {activeSite ? (
          <Button asChild variant="outline">
            <Link href={`/sites/${activeSite.id}`}>Open site record</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>Choose a site to open</Button>
        )}
        <Button asChild variant="outline">
          <Link href="/sites">Add site / implementation</Link>
        </Button>
        <div className="rounded-xl border border-border bg-slate-50 px-2.5 py-1.5 text-[13px] leading-5 text-muted-foreground">
          {viewMode === "peer-review"
            ? "Sites are grouped by implementation month. In `Peer review`, click inside the orange review cell, type, then press `Enter` or click away to save."
            : "Sites are grouped by implementation month. `All visible sites` now shows the today-forward backlog across every month; use month scope to jump to one month or review past sites."}
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="h-[720px] animate-pulse rounded-2xl border border-border bg-white" />
      ) : rows.length && sites.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#c7dde5] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(242,248,252,0.98))] px-3 py-2 shadow-soft">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              T-minus dates
            </div>
            <Select value={timelineSiteId} onChange={(event) => setTimelineSiteId(event.target.value)} className="min-w-[260px] md:max-w-md">
              <option value="">First visible site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{siteOptionLabel(site)}</option>
              ))}
            </Select>
            <div className="text-sm text-slate-600">
              {activeTimelineSite
                ? <>Left timeline follows <span className="font-medium text-slate-900">{activeTimelineSite.siteName}</span>.</>
                : "Left timeline follows the first visible site."}
            </div>
          </div>
          <TrackerGrid
            rows={rows}
            sites={sites}
            mode={viewMode}
            activeSiteId={activeSiteId}
            timelineSiteId={activeTimelineSiteId}
            onCellValueChange={onCellValueChange}
            onInlineStatusSave={onInlineStatusSave}
            onInlineNoteSave={onInlineNoteSave}
            onInlinePeerReviewSave={onInlinePeerReviewSave}
            onOpenSiteMode={openSiteMode}
            onTaskOpen={setPeekTask}
            onExportReady={setGridApi}
          />
        </div>
      ) : (
        <EmptyState
          title="No tracker matrix available"
          description="This technology tab has no imported workbook tasks for the current filters."
        />
      )}

      {workstream === "WIRELESS" && wirelessReferenceItems.length ? (
        <section className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-soft">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">Wireless references</h2>
            <p className="text-sm text-muted-foreground">
              Workbook-wide reference rows stay here as informational context. They are not tied to individual sites and do not carry status buttons.
            </p>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {wirelessReferenceItems.map((task) => (
              <div key={wirelessReferenceKey(task)} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Unsequenced</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{task.phase || "Reference"}</div>
                  <div className="text-sm text-slate-700">{task.title}</div>
                  {task.description && task.description !== task.title ? (
                    <div className="mt-1 text-xs text-slate-500">{task.description}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <QuickPeekSheet
        task={peekTask}
        open={Boolean(peekTask)}
        onOpenChange={(open) => !open && setPeekTask(null)}
        onTaskChange={(updated) => setPeekTask(updated)}
      />
    </div>
  );
}
