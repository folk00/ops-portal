"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type {
  CellDoubleClickedEvent,
  CellValueChangedEvent,
  ColDef,
  ColGroupDef,
  CellClassParams,
  CellStyle,
  GridApi,
  GridReadyEvent,
} from "ag-grid-community";

import { cn } from "@/lib/utils";
import type { TaskRecord } from "@/types/domain";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Pending / on hold" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "NA", label: "N/A" },
];

const PEER_REVIEW_STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Pending / on hold" },
  { value: "IN_PROGRESS", label: "Partial completed" },
  { value: "DONE", label: "Completed" },
  { value: "NA", label: "N/A" },
];

function trackerDisplayStatus(statusValue: string, pristine = false) {
  if (pristine && statusValue === "NOT_STARTED") return "NA";
  return statusValue;
}

function implementationMonthLabel(value?: string | null) {
  if (!value) return "No implementation date";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "No implementation date";
  return format(parsed, "MMM yyyy");
}

function implementationMonthGroupKey(value?: string | null) {
  if (!value) return "undated";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "undated";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export type TrackerMatrixSite = {
  id: number;
  siteCode: string;
  siteName: string;
  implementationDate?: string | null;
  siteEngineer?: string | null;
  peerReviewer?: string | null;
};

export type TrackerMatrixCell = {
  task: TaskRecord;
  statusValue: string;
  noteValue: string;
  peerReviewValue: string;
  peerReviewAuthorName?: string | null;
};

export type TrackerViewMode = "execution" | "peer-review";

export type TrackerMatrixRow = {
  rowKey: string;
  rowOrder: number;
  timelineLabel: string;
  phase: string;
  taskTitle: string;
  isPeerReview: boolean;
  cells: Record<number, TrackerMatrixCell>;
};

function isPeerReviewRow(row: TrackerMatrixRow | undefined | null) {
  if (!row) return false;
  return row.isPeerReview || /peer review/i.test(`${row.phase} ${row.taskTitle}`);
}

type TrackerLeftAccentTone = "peer-review" | "success" | "warning" | "highlight" | null;

const SDA_SUCCESS_PATTERNS = [
  /voice team review/i,
  /implementation plan started/i,
  /confirm\s+["']?ip pools["']?/i,
  /confirm bom is ready to submit hw order/i,
  /run forescout exports script/i,
  /all endpoints validated/i,
  /\b(?:sda|sd-wan)\s+peer review completed\b/i,
];

const SDA_WARNING_PATTERNS = [
  /fiber-to-patch panel cable asked on bom/i,
];

const SDWAN_SUCCESS_PATTERNS = [
  /\bcircuit status\b/i,
  /confirm bom is ready to submit hw order/i,
  /sd-wan peer review completed/i,
];

const WIRELESS_SUCCESS_PATTERNS = [
  /fill out idf tab:\s*recycle column and enclosures/i,
  /wireless implementation plan completed/i,
  /review if option 43 is completed on t-2/i,
  /wireless peer review completed/i,
  /confirm bom is ready to submit hw order/i,
];

const WIRELESS_HIGHLIGHT_PATTERNS = [
  /identify certificate-based ssids/i,
  /confirmation for clients and biomed devices/i,
];

function representativeTaskForRow(row: TrackerMatrixRow | undefined, activeSiteId: number | null, visibleSiteIds: number[]) {
  if (!row) return undefined;
  const fallbackSiteId = visibleSiteIds.find((siteId) => Boolean(row.cells[siteId]));
  return (activeSiteId ? row.cells[activeSiteId]?.task : undefined) || (fallbackSiteId ? row.cells[fallbackSiteId]?.task : undefined);
}

function leftAccentToneForRow(row: TrackerMatrixRow | undefined, activeSiteId: number | null, visibleSiteIds: number[]): TrackerLeftAccentTone {
  if (!row) return null;
  if (isPeerReviewRow(row)) return "peer-review";

  const task = representativeTaskForRow(row, activeSiteId, visibleSiteIds);
  const workstreamKey = task?.workstream?.key?.toUpperCase().replace(/[^A-Z]/g, "") || "";
  const haystack = `${row.phase} ${row.taskTitle}`;

  if (workstreamKey === "SDA") {
    if (SDA_WARNING_PATTERNS.some((pattern) => pattern.test(haystack))) return "warning";
    if (SDA_SUCCESS_PATTERNS.some((pattern) => pattern.test(haystack))) return "success";
  }

  if (workstreamKey === "SDWAN") {
    if (SDWAN_SUCCESS_PATTERNS.some((pattern) => pattern.test(haystack))) return "success";
  }

  if (workstreamKey === "WIRELESS") {
    if (WIRELESS_HIGHLIGHT_PATTERNS.some((pattern) => pattern.test(haystack))) return "highlight";
    if (WIRELESS_SUCCESS_PATTERNS.some((pattern) => pattern.test(haystack))) return "success";
  }

  return null;
}

function leftAccentStyle(
  tone: TrackerLeftAccentTone,
  column: "phase" | "task",
): CellStyle {
  if (tone === "peer-review") {
    return {
      backgroundColor: column === "phase" ? "#f59e0b" : "#fee2e2",
    };
  }

  if (tone === "success") {
    return {
      backgroundColor: column === "phase" ? "#dcfce7" : "#ecfccb",
    };
  }

  if (tone === "warning") {
    return {
      backgroundColor: column === "phase" ? "#fed7aa" : "#ffedd5",
    };
  }

  if (tone === "highlight") {
    return {
      backgroundColor: column === "phase" ? "#fef08a" : "#fef08a",
    };
  }

  return { backgroundColor: "#ffffff" };
}

function leftAccentClass(
  tone: TrackerLeftAccentTone,
  column: "phase" | "task",
) {
  if (tone === "peer-review") {
    return column === "phase"
      ? "font-semibold text-orange-950"
      : "font-semibold text-slate-900";
  }

  if (tone === "success") {
    return column === "phase"
      ? "font-semibold text-emerald-900"
      : "font-semibold text-slate-900";
  }

  if (tone === "warning") {
    return column === "phase"
      ? "font-semibold text-orange-900"
      : "font-medium text-slate-900";
  }

  if (tone === "highlight") {
    return column === "phase"
      ? "font-semibold text-amber-950"
      : "font-medium text-slate-900";
  }

  return column === "phase" ? "font-medium text-slate-700" : "text-slate-900";
}

function MatrixNoteCell({
  value,
  onSave,
  placeholder = "Click to add note",
  reviewerName,
  accent = "sky",
  compact = false,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  reviewerName?: string | null;
  accent?: "sky" | "orange";
  compact?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    const length = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(length, length);
  }, [isEditing]);

  const commit = async () => {
    const nextValue = draft.trim();
    if (nextValue === value.trim()) {
      setIsEditing(false);
      return;
    }
    if (!nextValue) {
      setIsEditing(false);
      setDraft(value);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(nextValue);
      setIsEditing(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className={compact ? "min-h-10" : "min-h-14"} onMouseDown={(event) => event.stopPropagation()}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void commit();
            }
          }}
          rows={compact ? 2 : 3}
          className={cn(
            "h-full w-full resize-none bg-white text-slate-700 outline-none ring-2",
            compact ? "min-h-10 rounded-md px-2 py-1 text-[11px] leading-4" : "min-h-14 rounded-lg px-2 py-1.5 text-[12px] leading-4",
            accent === "orange" ? "border border-orange-200 ring-orange-100" : "border border-sky-200 ring-sky-100",
          )}
          placeholder={accent === "orange" ? "Type peer review and press Enter" : "Type note and press Enter"}
          disabled={isSaving}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      title={value || undefined}
      className={cn(
        "w-full border text-left transition",
        compact ? "min-h-10 rounded-md px-2 py-1 text-[11px] leading-4" : "min-h-14 rounded-lg px-2 py-1.5 text-[12px] leading-4",
        value
          ? accent === "orange"
            ? "border-orange-200 bg-white text-slate-700 hover:border-orange-300"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          : accent === "orange"
            ? "border-dashed border-orange-200 bg-orange-50/60 text-slate-500 hover:border-orange-300 hover:bg-orange-50"
            : "border-dashed border-slate-200 bg-slate-50 text-slate-500 hover:border-sky-200 hover:bg-sky-50/50",
      )}
      onClick={(event) => {
        event.stopPropagation();
        setIsEditing(true);
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {value && reviewerName ? (
        <div className={cn(compact ? "mb-0.5 text-[9px]" : "mb-1 text-[10px]", "uppercase tracking-[0.16em]", accent === "orange" ? "text-orange-700" : "text-slate-500")}>
          {reviewerName}
        </div>
      ) : null}
      <div className={cn(compact ? "line-clamp-2" : "line-clamp-3", "whitespace-normal break-words", !value && "text-slate-400")}>
        {value || placeholder}
      </div>
    </button>
  );
}

function CompactTextCell({ value, lines = 2, compact = false }: { value: string; lines?: 1 | 2 | 4; compact?: boolean }) {
  return (
    <div
      title={value}
      className={cn(
        "whitespace-normal break-words",
        compact ? "text-[13px] leading-4" : "text-sm leading-5",
        lines === 1 ? "line-clamp-1" : lines === 2 ? "line-clamp-2" : "line-clamp-4",
      )}
    >
      {value}
    </div>
  );
}

function workbookStatusStyle(statusValue: string, compact = false, pristine = false) {
  const displayValue = trackerDisplayStatus(statusValue, pristine);
  if (displayValue === "DONE") return compact ? "border-emerald-500 bg-emerald-200" : "border-emerald-200 bg-emerald-50";
  if (displayValue === "IN_PROGRESS") return compact ? "border-lime-400 bg-lime-100" : "border-sky-200 bg-sky-50";
  if (displayValue === "NOT_STARTED") return "border-orange-200 bg-orange-50";
  if (displayValue === "BLOCKED") return "border-slate-200 bg-slate-50";
  if (displayValue === "NA") return "border-zinc-200 bg-zinc-100";
  return "border-slate-200 bg-slate-50";
}

function workbookRowStyle(statusValue: string | undefined, compact = false, pristine = false) {
  const displayValue = statusValue ? trackerDisplayStatus(statusValue, pristine) : statusValue;
  if (displayValue === "DONE") return { backgroundColor: compact ? "#bbf7d0" : "#f0fdf4" };
  if (displayValue === "IN_PROGRESS") return { backgroundColor: compact ? "#ecfccb" : "#eff6ff" };
  if (displayValue === "NOT_STARTED") return { backgroundColor: "#fff7ed" };
  if (displayValue === "NA") return { backgroundColor: "#fafafa" };
  return displayValue ? { backgroundColor: "#f8fafc" } : undefined;
}

function siteScopedCellStyle(params: CellClassParams<TrackerMatrixRow>): CellStyle | undefined {
  const row = params.data;
  if (!row) return undefined;
  const colId = params.colDef.colId || "";
  const [kind, siteIdRaw] = colId.split(":");
  if (kind !== "status" && kind !== "note") return undefined;
  const siteId = Number(siteIdRaw);
  if (!siteId) return undefined;
  const statusValue = row.cells[siteId]?.statusValue;
  return workbookRowStyle(statusValue, isPeerReviewRow(row), Boolean(row.cells[siteId]?.task.is_pristine_seed));
}

function MatrixStatusCell({
  value,
  onSave,
  compact = false,
  peerReview = false,
  pristine = false,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  compact?: boolean;
  peerReview?: boolean;
  pristine?: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const options = peerReview ? PEER_REVIEW_STATUS_OPTIONS : STATUS_OPTIONS;
  const displayValue = trackerDisplayStatus(value, pristine);

  return (
    <div
      className={cn(
        "flex items-center justify-center border px-1",
        compact ? "min-h-10 rounded-md py-0.5" : "min-h-12 rounded-lg py-1",
        workbookStatusStyle(value, compact, pristine),
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <select
        value={displayValue}
        disabled={isSaving}
        className={cn(
          "w-full appearance-none bg-transparent px-2 text-center font-medium text-slate-700 outline-none",
          compact ? "text-[10px]" : "text-[11px]",
        )}
        onClick={(event) => event.stopPropagation()}
        onChange={async (event) => {
          setIsSaving(true);
          try {
            await onSave(event.target.value);
          } finally {
            setIsSaving(false);
          }
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatTimelineWindow(task: TaskRecord | undefined) {
  if (!task) return null;
  if (task.timeline_window_start && task.timeline_window_end) {
    return `${format(parseISO(task.timeline_window_start), "MMM d")} to ${format(parseISO(task.timeline_window_end), "MMM d")}`;
  }
  if (task.timeline_window_label) return task.timeline_window_label;
  return null;
}

function formatTimelineWorkbookLabel(task: TaskRecord | undefined, fallbackLabel: string) {
  if (!task?.timeline_window_start || !task.timeline_window_end) {
    return task?.timeline_window_label || fallbackLabel;
  }

  const baseLabel = task.timeline_window_label || fallbackLabel;
  const match = baseLabel.match(/T-(\d+)(?:\s*to\s*T-(\d+))?/i);
  if (!match) return baseLabel;

  const startWeek = Number(match[1]);
  const endWeek = match[2] ? Number(match[2]) : Math.max(startWeek - 1, 0);
  const startBoundary = parseISO(task.timeline_window_start);
  const endBoundary = parseISO(task.timeline_window_end);
  if (endWeek !== 0) {
    endBoundary.setDate(endBoundary.getDate() + 1);
  }

  return `T-${startWeek}(${format(startBoundary, "dd-MMM-yy")}) to T-${endWeek}(${format(endBoundary, "dd-MMM-yy")})`;
}

function compactTimelineDisplay(task: TaskRecord | undefined, fallbackLabel: string) {
  if (!task?.timeline_window_start || !task.timeline_window_end) {
    return {
      title: task?.timeline_window_label || fallbackLabel,
      primary: task?.timeline_window_label || fallbackLabel,
      secondary: null as string | null,
      tertiary: null as string | null,
    };
  }

  const fullLabel = formatTimelineWorkbookLabel(task, fallbackLabel);
  const baseLabel = task.timeline_window_label || fallbackLabel;
  const match = baseLabel.match(/T-(\d+)(?:\s*to\s*T-(\d+))?/i);
  if (!match) {
    return {
      title: fullLabel,
      primary: fullLabel,
      secondary: null,
      tertiary: null,
    };
  }

  const startWeek = Number(match[1]);
  const endWeek = match[2] ? Number(match[2]) : Math.max(startWeek - 1, 0);
  const startBoundary = parseISO(task.timeline_window_start);
  const endBoundary = parseISO(task.timeline_window_end);
  if (endWeek !== 0) {
    endBoundary.setDate(endBoundary.getDate() + 1);
  }

  return {
    title: fullLabel,
    primary: `T-${startWeek} to T-${endWeek}`,
    secondary: format(startBoundary, "dd-MMM-yy"),
    tertiary: format(endBoundary, "dd-MMM-yy"),
  };
}

function TimelineCell({
  row,
  timelineSiteId,
  visibleSiteIds,
}: {
  row: TrackerMatrixRow;
  timelineSiteId: number | null;
  visibleSiteIds: number[];
}) {
  const fallbackSiteId = visibleSiteIds.find((siteId) => Boolean(row.cells[siteId]));
  const task = (timelineSiteId ? row.cells[timelineSiteId]?.task : undefined) || (fallbackSiteId ? row.cells[fallbackSiteId]?.task : undefined);
  const display = compactTimelineDisplay(task, row.timelineLabel);
  const range = task ? formatTimelineWindow(task) : null;
  const compact = isPeerReviewRow(row);

  return (
    <div className={cn("text-center", compact ? "py-0.5" : "py-1")} title={display.title}>
      <div className={cn("font-medium text-slate-900", compact ? "text-[13px] leading-4" : "text-sm leading-4")}>{display.primary}</div>
      {display.secondary ? <div className={cn("text-slate-500", compact ? "mt-0.5 text-[10px] leading-3.5" : "mt-1 text-[11px] leading-4")}>{display.secondary}</div> : null}
      {display.tertiary ? <div className={cn("text-slate-500", compact ? "text-[10px] leading-3.5" : "text-[11px] leading-4")}>{display.tertiary}</div> : null}
      {range && !display.secondary ? <div className={cn("text-slate-500", compact ? "mt-0.5 text-[10px] leading-3.5" : "mt-1 text-[11px] leading-4")}>{range}</div> : null}
    </div>
  );
}

function SiteHeaderGroup(props: {
  siteId: number;
  siteName: string;
  siteEngineer?: string | null;
  peerReviewer?: string | null;
  implementationDate?: string | null;
  mode: TrackerViewMode;
  onOpenSiteMode: (siteId: number, mode: TrackerViewMode) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-semibold text-slate-900">{props.siteName}</div>
        <div className="shrink-0 text-[11px] leading-4 text-slate-500">
          {props.implementationDate ? format(parseISO(props.implementationDate), "MMM d, yyyy") : "TBD"}
        </div>
      </div>
      <div className="text-[11px] leading-4 text-slate-500">
        {props.mode === "peer-review"
          ? props.peerReviewer
            ? `Peer reviewer: ${props.peerReviewer}`
            : "Peer reviewer: Unassigned"
          : props.siteEngineer
            ? `Assigned: ${props.siteEngineer}`
            : "Assigned: Unassigned"}
      </div>
      <div>
        <button
          type="button"
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-medium transition",
            props.mode === "peer-review"
              ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onOpenSiteMode(props.siteId, props.mode === "peer-review" ? "execution" : "peer-review");
          }}
        >
          {props.mode === "peer-review" ? "Execution" : "Peer review"}
        </button>
      </div>
    </div>
  );
}

function buildSiteColumn(
  site: TrackerMatrixSite,
  mode: TrackerViewMode,
  onInlineStatusSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>,
  onInlineNoteSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>,
  onInlinePeerReviewSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>,
  onOpenSiteMode: (siteId: number, mode: TrackerViewMode) => void,
): ColGroupDef<TrackerMatrixRow> {
  return {
    headerName: site.siteName,
    groupId: `site:${site.id}`,
    marryChildren: true,
    headerGroupComponent: SiteHeaderGroup,
    headerGroupComponentParams: {
      siteId: site.id,
      siteName: site.siteName,
      siteEngineer: site.siteEngineer,
      peerReviewer: site.peerReviewer,
      implementationDate: site.implementationDate,
      mode,
      onOpenSiteMode,
    },
    wrapHeaderText: true,
    autoHeaderHeight: true,
    children: [
      {
        colId: `status:${site.id}`,
        headerName: "Status",
        width: 150,
        minWidth: 150,
        wrapHeaderText: true,
        autoHeaderHeight: true,
        cellRenderer: (params: { data?: TrackerMatrixRow }) => {
          const cell = params.data?.cells[site.id];
          if (!cell) return <span className="text-xs text-slate-300">-</span>;
          const compact = isPeerReviewRow(params.data);
          return (
            <MatrixStatusCell
              value={cell.statusValue}
              compact={compact}
              peerReview={compact}
              pristine={Boolean(cell.task.is_pristine_seed)}
              onSave={(value) => onInlineStatusSave(params.data as TrackerMatrixRow, site.id, value)}
            />
          );
        },
      },
      {
        colId: `note:${site.id}`,
        headerName: mode === "peer-review" ? "Peer review" : "Latest note",
        width: 248,
        minWidth: 228,
        wrapHeaderText: true,
        autoHeaderHeight: true,
        cellRenderer: (params: { data?: TrackerMatrixRow }) => {
          const cell = params.data?.cells[site.id];
          if (!cell) return <span className="text-xs text-slate-300">-</span>;
          const compact = isPeerReviewRow(params.data);
          return (
            <MatrixNoteCell
              value={mode === "peer-review" ? cell.peerReviewValue : cell.noteValue}
              reviewerName={mode === "peer-review" ? cell.peerReviewAuthorName : null}
              placeholder={mode === "peer-review" ? "Click to add peer review" : "Click to add note"}
              accent={mode === "peer-review" ? "orange" : "sky"}
              compact={compact}
              onSave={(value) =>
                mode === "peer-review"
                  ? onInlinePeerReviewSave(params.data as TrackerMatrixRow, site.id, value)
                  : onInlineNoteSave(params.data as TrackerMatrixRow, site.id, value)
              }
            />
          );
        },
      },
    ],
  };
}

export function TrackerGrid({
  rows,
  sites,
  mode,
  activeSiteId,
  timelineSiteId,
  onCellValueChange,
  onInlineStatusSave,
  onInlineNoteSave,
  onInlinePeerReviewSave,
  onOpenSiteMode,
  onTaskOpen,
  onExportReady,
}: {
  rows: TrackerMatrixRow[];
  sites: TrackerMatrixSite[];
  mode: TrackerViewMode;
  activeSiteId: number | null;
  timelineSiteId: number | null;
  onCellValueChange: (event: CellValueChangedEvent<TrackerMatrixRow>) => void;
  onInlineStatusSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>;
  onInlineNoteSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>;
  onInlinePeerReviewSave: (row: TrackerMatrixRow, siteId: number, value: string) => Promise<void>;
  onOpenSiteMode: (siteId: number, mode: TrackerViewMode) => void;
  onTaskOpen: (task: TaskRecord) => void;
  onExportReady: (api: GridApi<TrackerMatrixRow> | null) => void;
}) {
  const gridShellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<AgGridReact<TrackerMatrixRow>>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topScrollContentRef = useRef<HTMLDivElement>(null);
  const scrollSyncRef = useRef<"top" | "grid" | null>(null);
  const [gridReadyVersion, setGridReadyVersion] = useState(0);
  const [topScrollbarMetrics, setTopScrollbarMetrics] = useState({ contentWidth: 0, viewportWidth: 0 });
  const visibleSiteIds = useMemo(() => sites.map((site) => site.id), [sites]);
  const groupedSiteColumns = useMemo<Array<ColGroupDef<TrackerMatrixRow>>>(
    () => {
      const groups = new Map<string, { label: string; children: ColGroupDef<TrackerMatrixRow>[] }>();

      for (const site of sites) {
        const monthKey = implementationMonthGroupKey(site.implementationDate);
        if (!groups.has(monthKey)) {
          groups.set(monthKey, {
            label: implementationMonthLabel(site.implementationDate),
            children: [],
          });
        }
        groups.get(monthKey)?.children.push(buildSiteColumn(site, mode, onInlineStatusSave, onInlineNoteSave, onInlinePeerReviewSave, onOpenSiteMode));
      }

      return Array.from(groups.entries()).map(([monthKey, group]) => ({
        headerName: group.label,
        groupId: `month:${monthKey}`,
        marryChildren: false,
        children: group.children,
      }));
    },
    [mode, onInlineNoteSave, onInlinePeerReviewSave, onInlineStatusSave, onOpenSiteMode, sites],
  );

  const columnDefs = useMemo<Array<ColDef<TrackerMatrixRow> | ColGroupDef<TrackerMatrixRow>>>(
    () => [
      {
        field: "timelineLabel",
        headerName: "T-minus",
        pinned: "left",
        width: 132,
        minWidth: 126,
        maxWidth: 138,
        suppressMovable: true,
        cellClass: "text-center",
        cellStyle: { backgroundColor: "#ffffff" },
        cellRenderer: (params: { data?: TrackerMatrixRow }) =>
          params.data ? <TimelineCell row={params.data} timelineSiteId={timelineSiteId} visibleSiteIds={visibleSiteIds} /> : null,
      },
      {
        field: "phase",
        headerName: "Phase",
        pinned: "left",
        width: 122,
        minWidth: 116,
        maxWidth: 132,
        suppressMovable: true,
        wrapHeaderText: true,
        autoHeaderHeight: true,
        cellRenderer: (params: { value?: string; data?: TrackerMatrixRow }) => (
          <CompactTextCell value={params.value || "-"} lines={params.data && isPeerReviewRow(params.data) ? 1 : 2} compact={Boolean(params.data && isPeerReviewRow(params.data))} />
        ),
        cellClass: (params) => {
          const tone = leftAccentToneForRow(params.data, activeSiteId, visibleSiteIds);
          return cn("text-center", leftAccentClass(tone, "phase"));
        },
        cellStyle: (params) => leftAccentStyle(leftAccentToneForRow(params.data, activeSiteId, visibleSiteIds), "phase"),
      },
      {
        field: "taskTitle",
        headerName: "Task step",
        pinned: "left",
        width: 206,
        minWidth: 190,
        maxWidth: 224,
        suppressMovable: true,
        wrapHeaderText: true,
        autoHeaderHeight: true,
        cellRenderer: (params: { value?: string; data?: TrackerMatrixRow }) => (
          <CompactTextCell value={params.value || "-"} lines={params.data && isPeerReviewRow(params.data) ? 2 : 4} compact={Boolean(params.data && isPeerReviewRow(params.data))} />
        ),
        cellClass: (params) => leftAccentClass(leftAccentToneForRow(params.data, activeSiteId, visibleSiteIds), "task"),
        cellStyle: (params) => leftAccentStyle(leftAccentToneForRow(params.data, activeSiteId, visibleSiteIds), "task"),
      },
      ...groupedSiteColumns,
    ],
    [activeSiteId, groupedSiteColumns, timelineSiteId, visibleSiteIds],
  );

  const onCellDoubleClicked = (event: CellDoubleClickedEvent<TrackerMatrixRow>) => {
    if (!event.data?.cells) return;
    const [kind, siteIdRaw] = (event.colDef.colId || "").split(":");
    if (kind === "note") return;
    const siteId = Number(siteIdRaw);
    if (!siteId) return;
    const cell = event.data.cells[siteId];
    if (cell) onTaskOpen(cell.task);
  };

  useEffect(() => {
    const shell = gridShellRef.current;
    const topScroll = topScrollRef.current;
    const topScrollContent = topScrollContentRef.current;
    if (!shell || !topScroll || !topScrollContent) return;

    const gridViewport = shell.querySelector<HTMLElement>(".ag-center-cols-viewport");
    const gridContent =
      shell.querySelector<HTMLElement>(".ag-body-horizontal-scroll-container") ||
      shell.querySelector<HTMLElement>(".ag-center-cols-container");
    if (!gridViewport || !gridContent) return;

    const syncMetrics = () => {
      const contentWidth = Math.max(gridContent.scrollWidth, Math.round(gridContent.getBoundingClientRect().width));
      const viewportWidth = gridViewport.clientWidth;
      topScrollContent.style.width = `${contentWidth}px`;
      topScroll.scrollLeft = gridViewport.scrollLeft;
      setTopScrollbarMetrics((current) =>
        current.contentWidth === contentWidth && current.viewportWidth === viewportWidth
          ? current
          : { contentWidth, viewportWidth },
      );
    };

    const releaseLock = () => {
      window.requestAnimationFrame(() => {
        scrollSyncRef.current = null;
      });
    };

    const handleTopScroll = () => {
      if (scrollSyncRef.current === "grid") return;
      scrollSyncRef.current = "top";
      gridViewport.scrollLeft = topScroll.scrollLeft;
      releaseLock();
    };

    const handleGridScroll = () => {
      if (scrollSyncRef.current === "top") return;
      scrollSyncRef.current = "grid";
      topScroll.scrollLeft = gridViewport.scrollLeft;
      releaseLock();
    };

    syncMetrics();
    const rafId = window.requestAnimationFrame(syncMetrics);
    const timeoutId = window.setTimeout(syncMetrics, 120);
    const resizeObserver = new ResizeObserver(syncMetrics);
    resizeObserver.observe(gridViewport);
    resizeObserver.observe(gridContent);

    topScroll.addEventListener("scroll", handleTopScroll, { passive: true });
    gridViewport.addEventListener("scroll", handleGridScroll, { passive: true });
    window.addEventListener("resize", syncMetrics);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
      topScroll.removeEventListener("scroll", handleTopScroll);
      gridViewport.removeEventListener("scroll", handleGridScroll);
      window.removeEventListener("resize", syncMetrics);
    };
  }, [columnDefs, gridReadyVersion, rows.length, sites.length]);

  const hasHorizontalOverflow = topScrollbarMetrics.contentWidth > topScrollbarMetrics.viewportWidth + 4;

  useEffect(() => {
    const targetSiteId = timelineSiteId || activeSiteId;
    if (!targetSiteId) return;
    if (!sites.some((site) => site.id === targetSiteId)) return;

    const api = gridRef.current?.api;
    if (!api) return;

    const ensureSelectedSiteVisible = () => {
      api.ensureColumnVisible(`status:${targetSiteId}`, "middle");

      const shell = gridShellRef.current;
      const topScroll = topScrollRef.current;
      const gridViewport = shell?.querySelector<HTMLElement>(".ag-center-cols-viewport");
      if (topScroll && gridViewport) {
        topScroll.scrollLeft = gridViewport.scrollLeft;
      }
    };

    const rafId = window.requestAnimationFrame(ensureSelectedSiteVisible);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeSiteId, gridReadyVersion, sites, timelineSiteId]);

  return (
    <div className="flex h-[80vh] min-h-[760px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-soft">
      <div className={cn("border-b border-border bg-slate-50/90 px-3 py-2", !hasHorizontalOverflow && "opacity-70")}>
        <div
          ref={topScrollRef}
          className="tracker-top-scrollbar overflow-x-auto overflow-y-hidden rounded-full border border-border bg-white/90"
          style={{ scrollbarGutter: "stable both-edges" }}
          aria-label="Horizontal tracker scroll"
        >
          <div ref={topScrollContentRef} className="h-3 min-w-full" />
        </div>
      </div>
      <div ref={gridShellRef} className="ag-theme-quartz min-h-0 flex-1">
        <AgGridReact
          ref={gridRef}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(params) => params.data.rowKey}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
          animateRows
          defaultColDef={{
            sortable: false,
            filter: false,
            resizable: true,
            suppressHeaderMenuButton: false,
            wrapHeaderText: true,
            autoHeaderHeight: true,
            cellStyle: siteScopedCellStyle,
          }}
          getRowHeight={(params) => (isPeerReviewRow(params.data) ? 60 : 90)}
          groupHeaderHeight={48}
          headerHeight={44}
          tooltipShowDelay={150}
          onGridReady={(event: GridReadyEvent<TrackerMatrixRow>) => {
            setGridReadyVersion((current) => current + 1);
            onExportReady(event.api);
          }}
          onCellValueChanged={onCellValueChange}
          onCellDoubleClicked={onCellDoubleClicked}
        />
      </div>
    </div>
  );
}
