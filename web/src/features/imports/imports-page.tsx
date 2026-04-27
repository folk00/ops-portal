"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data-display/empty-state";
import { ImportStatusCard } from "@/components/data-display/import-status-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useImportJob } from "@/hooks/use-import-job";
import { cn } from "@/lib/utils";
import { useImports, useUploadImport } from "@/lib/queries";

export function ImportsPage() {
  const { data = [], isLoading } = useImports();
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const upload = useUploadImport();
  const job = useImportJob(jobId);
  const jobStatus = job.data?.status;
  const jobTerminal = jobStatus === "done" || jobStatus === "failed";
  const importBusy = upload.isPending || (Boolean(jobId) && !jobTerminal);

  const resetDialog = () => {
    setSelectedFile(null);
    setJobId(null);
    setPickerKey((value) => value + 1);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && importBusy) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDialog();
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error("Choose a workbook before starting the import.");
      return;
    }

    try {
      const result = await upload.mutateAsync(selectedFile);
      setJobId(result.job_id);
      toast.success("Workbook queued. Import is running in the background.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workbook import failed";
      toast.error(message);
    }
  };

  useEffect(() => {
    if (!jobId || !jobStatus) {
      return;
    }

    if (jobStatus === "done") {
      toast.success("Workbook imported into PostgreSQL.");
      setOpen(false);
      resetDialog();
      return;
    }

    if (jobStatus === "failed") {
      toast.error(job.data?.error || "Workbook import failed");
      setJobId(null);
    }
  }, [job.data?.error, jobId, jobStatus]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        subtitle="Workbook migration history, parser outcomes, and reproducible re-import entry points. Phase 1 starts from a migrated workbook-backed database state by default."
        actions={<Button onClick={() => setOpen(true)}>Re-import workbook</Button>}
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="h-48 animate-pulse rounded-2xl border border-border bg-white" />)}</div>
      ) : data.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((item) => <ImportStatusCard key={item.id} item={item} />)}
        </div>
      ) : (
        <EmptyState title="No imports recorded" description="Run the workbook seed or import the workbook manually to create traceable import history." />
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-import workbook</DialogTitle>
            <DialogDescription>Phase 1 uses the workbook as a migration and compatibility source, not the runtime datastore.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-5">
            <div className="rounded-2xl border border-dashed border-border bg-slate-50 p-4">
              <p className="text-sm font-medium text-foreground">Pick the workbook to migrate into PostgreSQL.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The import keeps raw row JSON for traceability and refreshes sites, tasks, users, and import history.
              </p>
            </div>

            {jobId ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm">
                <p className="font-medium text-slate-900">Background import job</p>
                <p className="mt-1 text-slate-700">
                  Job <span className="font-mono text-xs">{jobId}</span> is{" "}
                  <span className="font-semibold">{jobStatus ?? "pending"}</span>
                  {job.data?.progress ? ` (${job.data.progress}%)` : ""}.
                </p>
                {job.data?.error ? <p className="mt-2 text-rose-700">{job.data.error}</p> : null}
              </div>
            ) : null}

            <div className="grid gap-3">
              <label className="text-sm font-medium text-foreground" htmlFor="workbook-upload">
                Workbook file
              </label>
              <input
                key={pickerKey}
                id="workbook-upload"
                type="file"
                accept=".xlsx"
                className={cn(
                  "block w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800",
                  importBusy && "cursor-not-allowed opacity-60",
                )}
                disabled={importBusy}
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-sm text-muted-foreground">
                {selectedFile ? `Selected: ${selectedFile.name}` : "Choose the current Workbook workbook."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={importBusy}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!selectedFile || importBusy}>
                {upload.isPending
                  ? "Uploading workbook..."
                  : jobId && !jobTerminal
                    ? "Import running..."
                    : "Import workbook"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
