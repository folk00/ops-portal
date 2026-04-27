"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { OwnerPill } from "@/components/data-display/owner-pill";
import { PriorityBadge } from "@/components/data-display/priority-badge";
import { StatusBadge } from "@/components/data-display/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TaskUpdateTimeline } from "@/components/data-display/task-update-timeline";
import { useAssignableUsers, usePatchTask, useTaskUpdates } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { TaskRecord } from "@/types/domain";

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Pending / on hold" },
  { value: "IN_PROGRESS", label: "Work in progress" },
  { value: "DONE", label: "Completed" },
  { value: "NA", label: "N/A" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export function QuickPeekSheet({
  task,
  open,
  onOpenChange,
  onTaskChange,
}: {
  task: TaskRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskChange?: (task: TaskRecord) => void;
}) {
  const { data: users = [] } = useAssignableUsers();
  const { data: updates = [], refetch: refetchUpdates } = useTaskUpdates(task?.id ?? null);
  const patchTask = usePatchTask();
  const [statusValue, setStatusValue] = useState("NOT_STARTED");
  const [priorityValue, setPriorityValue] = useState("MEDIUM");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    if (!task) return;
    setStatusValue(task.status.value);
    setPriorityValue(task.priority.value);
    setOwnerId(task.owner?.id ? String(task.owner.id) : "");
    setDueDate(task.due_date || "");
    setNewNote("");
  }, [task]);

  const assignableUsers = useMemo(() => users.filter((item) => item.id != null), [users]);
  const hasTaskChanges =
    !!task &&
    (statusValue !== task.status.value ||
      priorityValue !== task.priority.value ||
      ownerId !== (task.owner?.id ? String(task.owner.id) : "") ||
      dueDate !== (task.due_date || ""));

  const saveTask = async () => {
    if (!task) return;
    try {
      const updated = await patchTask.mutateAsync({
        id: task.id,
        payload: {
          status: statusValue,
          priority: priorityValue,
          owner_id: ownerId ? Number(ownerId) : null,
          due_date: dueDate || null,
        },
      });
      onTaskChange?.(updated);
      toast.success("Task updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task update failed");
    }
  };

  const addNote = async () => {
    if (!task || !newNote.trim()) return;
    try {
      const updated = await patchTask.mutateAsync({
        id: task.id,
        payload: {
          comment: newNote.trim(),
        },
      });
      onTaskChange?.(updated);
      setNewNote("");
      await refetchUpdates();
      toast.success("Note added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {task ? (
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="border-b border-border px-5 py-5">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{task.site.site_code}</div>
              <h2 className="mt-2 text-xl font-semibold">{task.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{task.description || "Workbook-migrated task with normalized metadata and raw traceability retained."}</p>
            </div>
            <div className="grid gap-4 px-5 py-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <OwnerPill owner={task.owner} />
              </div>
              <div className="grid gap-2 rounded-2xl border border-border bg-slate-50 px-4 py-4">
                <div><span className="font-medium">Timeline:</span> {task.timeline_label}</div>
                <div><span className="font-medium">Phase:</span> {task.phase || "Unspecified"}</div>
                <div><span className="font-medium">Workstream:</span> {task.workstream?.name || "Shared"}</div>
                <div><span className="font-medium">Due:</span> {task.due_date ? format(new Date(task.due_date), "PPP") : "Not set"}</div>
                <div><span className="font-medium">Source sheet:</span> {task.source_tab || "Portal-created"}</div>
                <div><span className="font-medium">Source row:</span> {task.source_row_key || "-"}</div>
                <div><span className="font-medium">Source column:</span> {task.source_column_key || "-"}</div>
                <div><span className="font-medium">Last updated:</span> {format(new Date(task.updated_at), "PPp")}</div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-border bg-white px-4 py-4">
                <div>
                  <div className="text-sm font-semibold">Edit task</div>
                  <div className="mt-1 text-sm text-muted-foreground">Change status faster here, then save owner, due date, and priority together.</div>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={statusValue === option.value ? "default" : "outline"}
                        size="sm"
                        className={cn("rounded-full", statusValue === option.value && "shadow-none")}
                        onClick={() => setStatusValue(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">Use `Pending / on hold` for work that has not started yet or is waiting on a dependency.</div>
                </div>
                <Select value={priorityValue} onChange={(event) => setPriorityValue(event.target.value)}>
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
                <Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                  ))}
                </Select>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                <div className="flex justify-end">
                  <Button onClick={saveTask} disabled={patchTask.isPending || !hasTaskChanges}>Save task changes</Button>
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-border bg-white px-4 py-4">
                <div>
                  <div className="text-sm font-semibold">Notes and execution updates</div>
                  <div className="mt-1 text-sm text-muted-foreground">The tracker cell shows the latest note preview. Save a note here to push it into the task history.</div>
                </div>
                <div className="rounded-xl border border-dashed border-border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current context</div>
                  <div className="mt-2 whitespace-pre-wrap">{task.note_preview || task.description || "No note saved yet."}</div>
                </div>
                <textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void addNote();
                    }
                  }}
                  rows={4}
                  className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:ring-2 focus:ring-ring/30"
                  placeholder="Add an operational note or blocker update. Press Enter to save, Shift+Enter for a new line."
                />
                <div className="flex justify-end">
                  <Button onClick={addNote} disabled={patchTask.isPending || !newNote.trim()}>
                    Save note
                  </Button>
                </div>
                <TaskUpdateTimeline updates={updates} />
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
