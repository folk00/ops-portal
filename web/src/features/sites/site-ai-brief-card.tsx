"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SectionCard } from "@/components/data-display/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAiReportModels, useAiUsageSummary, useGenerateSiteAiReport, useSites } from "@/lib/queries";
import type { SiteAiReportResponse, SiteAiReportType } from "@/types/domain";

const REPORT_TYPE_LABELS: Record<SiteAiReportType, string> = {
  go_no_go: "Go / No-Go",
  executive: "Executive brief",
  status_update: "Status update",
};

const STATUS_TONES: Record<string, "green" | "amber" | "red" | "zinc"> = {
  READY: "green",
  AT_RISK: "amber",
  NO_GO_LIKELY: "red",
  NOT_MAPPED: "zinc",
};

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "red" }) {
  const toneClasses = {
    green: "border-emerald-200 bg-emerald-50/70",
    amber: "border-amber-200 bg-amber-50/70",
    red: "border-rose-200 bg-rose-50/70",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">Nothing notable returned for this section.</div>
      )}
    </div>
  );
}

function TechnologyCard({ item }: { item: SiteAiReportResponse["technology_snapshots"][number] }) {
  return (
    <div className="rounded-2xl border border-border bg-slate-50/80 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[#0c2f43]">{item.workstream_name}</div>
        <Badge tone={STATUS_TONES[item.status] ?? "zinc"}>{item.status.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</p>
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next step</div>
      <p className="mt-1 text-sm text-slate-700">{item.next_step}</p>
    </div>
  );
}

export function SiteAiBriefCard({ siteId }: { siteId: number }) {
  const router = useRouter();
  const { data: models, isLoading, error } = useAiReportModels();
  const { data: usageSummary } = useAiUsageSummary();
  const generateReport = useGenerateSiteAiReport();
  const sitePickerParams = useMemo(() => {
    const next = new URLSearchParams();
    next.set("active", "true");
    return next;
  }, []);
  const { data: siteOptions = [] } = useSites(sitePickerParams);
  const [selectedSiteId, setSelectedSiteId] = useState(siteId);
  const [selectedModel, setSelectedModel] = useState("");
  const [reportType, setReportType] = useState<SiteAiReportType>("go_no_go");
  const [report, setReport] = useState<SiteAiReportResponse | null>(null);

  useEffect(() => {
    if (selectedModel || !models?.length) return;
    setSelectedModel(models.find((item) => item.is_default)?.id ?? models[0].id);
  }, [models, selectedModel]);

  useEffect(() => {
    if (siteId > 0) {
      setSelectedSiteId(siteId);
    }
  }, [siteId]);

  useEffect(() => {
    if (selectedSiteId > 0 || !siteOptions.length) return;
    setSelectedSiteId(siteId > 0 ? siteId : siteOptions[0].id);
  }, [selectedSiteId, siteId, siteOptions]);

  const effectiveSiteId = selectedSiteId > 0 ? selectedSiteId : siteId;

  const requestedModelLabel = useMemo(
    () => models?.find((item) => item.id === selectedModel)?.label ?? selectedModel,
    [models, selectedModel],
  );
  const currentSiteLabel = useMemo(
    () => siteOptions.find((item) => item.id === effectiveSiteId)?.site_name ?? `Site ${effectiveSiteId}`,
    [effectiveSiteId, siteOptions],
  );

  useEffect(() => {
    setReport(null);
  }, [effectiveSiteId]);

  function handleSiteChange(nextSiteIdRaw: string) {
    const nextSiteId = Number(nextSiteIdRaw);
    if (Number.isNaN(nextSiteId) || nextSiteId === effectiveSiteId) return;
    if (siteId > 0) {
      router.push(`/sites/${nextSiteId}`);
      return;
    }
    setSelectedSiteId(nextSiteId);
  }

  async function handleGenerate() {
    if (!selectedModel) {
      toast.error("Choose a model first.");
      return;
    }

    if (!effectiveSiteId) {
      toast.error("Choose a site first.");
      return;
    }

    try {
      const nextReport = await generateReport.mutateAsync({
        siteId: effectiveSiteId,
        model: selectedModel,
        reportType,
      });
      setReport(nextReport);
      toast.success("AI brief generated.");
    } catch (generationError) {
      toast.error(generationError instanceof Error ? generationError.message : "Could not generate the AI brief");
    }
  }

  return (
    <SectionCard
      title="AI Site Brief"
      description="Generate a polished site report from live health, velocity, triage, and task data."
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_1fr_auto]">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Site</div>
            <Select value={effectiveSiteId ? String(effectiveSiteId) : ""} onChange={(event) => handleSiteChange(event.target.value)}>
              {!effectiveSiteId ? <option value="">Choose a site</option> : null}
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Model</div>
            <Select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={isLoading || !models?.length}>
              <option value="">{isLoading ? "Loading models..." : "Choose a model"}</option>
              {models?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} ({model.vendor})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Report type</div>
            <Select value={reportType} onChange={(event) => setReportType(event.target.value as SiteAiReportType)}>
              {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={generateReport.isPending || !selectedModel} className="w-full lg:w-auto">
              {generateReport.isPending ? "Generating..." : report ? "Regenerate" : "Generate report"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground">
          Runs server-side through CX AI Playground for <span className="font-medium text-slate-700">{currentSiteLabel}</span>. The token never leaves the API container.
        </div>

        {usageSummary ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">{usageSummary.actor_label}</span> has used{" "}
            <span className="font-semibold">{usageSummary.used_today}</span> of{" "}
            <span className="font-semibold">{usageSummary.daily_limit}</span> AI reports today.{" "}
            <span className="font-medium">{usageSummary.remaining_today}</span> remaining.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {error instanceof Error ? error.message : "Could not load AI models."}
          </div>
        ) : null}

        {!report ? (
          <div className="rounded-[28px] border border-dashed border-[#b9dde5] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(236,246,252,0.92)_48%,_rgba(226,241,249,0.82))] px-6 py-8">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-[0.22em] text-[#5b7c90]">Ready when you are</div>
              <div className="mt-2 text-2xl font-semibold text-[#0c2f43]">Generate a leadership-ready site report</div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The brief pulls the current site picture into one readable summary: health, velocity, T-2 readiness,
                peer review, key blockers, and the next actions that matter.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-[#b9dde5] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(232,244,249,0.95)_45%,_rgba(221,238,247,0.88))] px-6 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#5b7c90]">{REPORT_TYPE_LABELS[report.report_type]}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-[#0c2f43]">{report.headline}</div>
                  {report.strapline ? <p className="mt-2 text-sm text-slate-600">{report.strapline}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={STATUS_TONES[report.overall_status] ?? "zinc"}>{report.overall_status.replaceAll("_", " ")}</Badge>
                  <Badge tone="blue">{report.confidence} confidence</Badge>
                </div>
              </div>

              <p className="mt-5 max-w-4xl text-[15px] leading-7 text-slate-700">{report.executive_summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Model: {report.model}</span>
                <span>|</span>
                <span>Requested: {requestedModelLabel}</span>
                <span>|</span>
                <span>{report.daily_remaining} remaining today</span>
                <span>|</span>
                <span>Generated {format(parseISO(report.generated_at), "PPp")}</span>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <ReportList title="What looks good" items={report.key_strengths} tone="green" />
              <ReportList title="Main risks" items={report.key_risks} tone="red" />
              <ReportList title="Recommended actions" items={report.recommended_actions} tone="amber" />
            </div>

            <div className="rounded-2xl border border-border bg-white">
              <div className="border-b border-border px-5 py-4">
                <div className="text-base font-semibold text-[#0c2f43]">Technology snapshots</div>
                <div className="mt-1 text-sm text-muted-foreground">Per-lane readout for the current site report.</div>
              </div>
              <div className="grid gap-4 px-5 py-5 xl:grid-cols-3">
                {report.technology_snapshots.length ? (
                  report.technology_snapshots.map((item) => (
                    <TechnologyCard key={`${item.workstream_name}-${item.status}-${item.next_step}`} item={item} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                    The model did not return structured technology snapshots for this run.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-slate-50/80 px-5 py-5">
              <div className="text-sm font-semibold text-[#0c2f43]">Evidence pulled into the report</div>
              {report.evidence.length ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {report.evidence.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#0c2f43]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">No explicit evidence bullets were returned in this draft.</div>
              )}
            </div>

            {siteId <= 0 && usageSummary?.recent_runs.length ? (
              <div className="rounded-2xl border border-border bg-white">
                <div className="border-b border-border px-5 py-4">
                  <div className="text-base font-semibold text-[#0c2f43]">Recent report activity</div>
                  <div className="mt-1 text-sm text-muted-foreground">Who used AI reports and when.</div>
                </div>
                <div className="divide-y divide-border">
                  {usageSummary.recent_runs.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-800">
                          {item.actor_label} ran {REPORT_TYPE_LABELS[item.report_type]} for {item.site_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.model} | {item.status} | {format(parseISO(item.created_at), "PPp")}
                        </div>
                        {item.error_message ? <div className="text-xs text-rose-700">{item.error_message}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
