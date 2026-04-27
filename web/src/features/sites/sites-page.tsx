"use client";

import { format, parseISO, startOfDay } from "date-fns";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/data-display/empty-state";
import { FilterBar } from "@/components/shell/filter-bar";
import { PageHeader } from "@/components/shell/page-header";
import { SystemViewRail } from "@/components/shell/system-view-rail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAssignableUsers, useCreateSite, usePatchSite, useSites } from "@/lib/queries";
import type { SiteCreateInput, SiteListItem } from "@/types/domain";

const DEFAULT_SITE_FORM: SiteCreateInput = {
  site_code: "",
  site_name: "",
  region: "Northeast",
  market: "Imported",
  migration_wave: "",
  notes: "",
  scheduled_date: "",
  workstream: "SDWAN",
  owner_id: null,
  sdwan_owner_id: null,
  sda_owner_id: null,
  wireless_owner_id: null,
};

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(",")),
  ].join("\n");
}

export function SitesPage() {
  const router = useRouter();
  const focusDate = useMemo(() => startOfDay(new Date()), []);
  const focusDateLabel = useMemo(() => format(focusDate, "MMM d, yyyy"), [focusDate]);
  const focusDateParam = useMemo(() => format(focusDate, "yyyy-MM-dd"), [focusDate]);
  const [search, setSearch] = useState("");
  const [workstream, setWorkstream] = useState("");
  const [view, setView] = useState("focus-window");
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [implementationDialogOpen, setImplementationDialogOpen] = useState(false);
  const [implementationSite, setImplementationSite] = useState<SiteListItem | null>(null);
  const [implementationDate, setImplementationDate] = useState("");
  const [siteForm, setSiteForm] = useState<SiteCreateInput>(DEFAULT_SITE_FORM);
  const { data: users = [] } = useAssignableUsers();
  const createSite = useCreateSite();
  const patchSite = usePatchSite();
  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (workstream) next.set("workstream", workstream);
    next.set("active", view === "archived" ? "false" : "true");
    if (view === "this-week") next.set("view", "this-week");
    if (view !== "all-sites" && view !== "archived") next.set("from_date", focusDateParam);
    return next;
  }, [focusDateParam, search, view, workstream]);
  const { data = [], isLoading } = useSites(params);
  const assignableUsers = useMemo(() => users.filter((item) => item.id != null), [users]);
  const siteCards = useMemo(
    () =>
      [...data].sort((left, right) => {
        const leftDate = left.next_migration_date ? new Date(left.next_migration_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDate = right.next_migration_date ? new Date(right.next_migration_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDate !== rightDate) return leftDate - rightDate;
        return left.site_name.localeCompare(right.site_name);
      }),
    [data]
  );

  const siteViews = useMemo(
    () => [
      {
        key: "focus-window",
        label: "Today onward",
        description: "Default operational slice. Anything before today stays stored but out of the way.",
        route: "/sites",
        filters: {},
      },
      {
        key: "this-week",
        label: "This week",
        description: "Only sites landing in the immediate execution window.",
        route: "/sites",
        filters: {},
      },
      {
        key: "all-sites",
        label: "All sites",
        description: "Includes older or already-passed windows kept for archive/reference.",
        route: "/sites",
        filters: {},
      },
      {
        key: "archived",
        label: "Archived",
        description: "Removed or canceled sites stay hidden from the operational lists but can be restored here.",
        route: "/sites",
        filters: {},
      },
    ],
    [focusDateLabel]
  );

  const trackerHref = (siteId: number, workstreamKey: string) => `/tracker?workstream=${workstreamKey}&site_id=${siteId}`;
  const openTracker = (siteId: number, workstreamKey: string) => {
    router.push(trackerHref(siteId, workstreamKey));
  };
  const parseDateOnly = (value: string) => parseISO(value);

  const windowStatusLabel = (value?: string | null) => {
    if (!value) return "Implementation TBD";
    const target = startOfDay(parseDateOnly(value));
    const diffDays = Math.round((target.getTime() - focusDate.getTime()) / 86_400_000);
    if (diffDays <= 0) return "Implementation today";
    if (diffDays === 1) return "Implementation tomorrow";
    if (diffDays <= 7) return "Implementation this week";
    return "Upcoming implementation";
  };

  const technologyStateLabel = (summary: { total_tasks: number; open_tasks: number; blocked_tasks: number; done_tasks: number }) => {
    if (!summary.total_tasks) return "Not mapped from workbook";
    if (!summary.open_tasks) return "Completed lane";
    if (summary.blocked_tasks === summary.open_tasks) return "Pending / on hold";
    if (summary.done_tasks > 0) return "In progress";
    return "Needs action";
  };

  const exportCsv = () => {
    const blob = new Blob(
      [
        toCsv(
          data.map((item) => ({
            site_code: item.site_code,
            site_name: item.site_name,
            market: item.market,
            workstreams: item.workstreams.join(" | "),
            open_tasks: item.open_tasks,
            blocked_tasks: item.blocked_tasks,
            done_tasks: item.done_tasks,
            next_migration_date: item.next_migration_date || "",
          }))
        ),
      ],
      { type: "text/csv;charset=utf-8;" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sites-view.csv";
    link.click();
  };

  const updateSiteForm = <K extends keyof SiteCreateInput>(key: K, value: SiteCreateInput[K]) => {
    setSiteForm((current) => ({ ...current, [key]: value }));
  };

  const openImplementationDialog = (site: SiteListItem) => {
    setImplementationSite(site);
    setImplementationDate(site.next_migration_date || "");
    setImplementationDialogOpen(true);
  };

  const submitImplementationDate = async () => {
    if (!implementationSite || !implementationDate) {
      toast.error("Choose an implementation date first.");
      return;
    }

    try {
      await patchSite.mutateAsync({
        id: implementationSite.id,
        payload: { scheduled_date: implementationDate },
      });
      toast.success("Implementation date updated.");
      setImplementationDialogOpen(false);
      setImplementationSite(null);
      setImplementationDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update implementation date");
    }
  };

  const toggleSiteActive = async (site: SiteListItem, nextActive: boolean) => {
    const actionLabel = nextActive ? "restore" : "remove";
    const confirmed = window.confirm(
      nextActive
        ? `Restore ${site.site_name} to the active site lists?`
        : `Remove ${site.site_name} from active planning views? This hides it without deleting historical data.`,
    );
    if (!confirmed) return;

    try {
      await patchSite.mutateAsync({
        id: site.id,
        payload: { active: nextActive },
      });
      toast.success(nextActive ? "Site restored." : "Site removed from active views.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${actionLabel} site`);
    }
  };

  const submitNewSite = async () => {
    if (!siteForm.site_name.trim() || !siteForm.scheduled_date) {
      toast.error("Site name and implementation date are required.");
      return;
    }

    try {
      const result = await createSite.mutateAsync({
        ...siteForm,
        site_code: siteForm.site_code?.trim() || null,
        migration_wave: siteForm.migration_wave?.trim() || null,
        notes: siteForm.notes?.trim() || null,
        owner_id: siteForm.owner_id || null,
      });
      setSiteDialogOpen(false);
      setSiteForm(DEFAULT_SITE_FORM);
      setSearch(result.site.site_name);
      toast.success("Site created with tracker starter tasks.");
      router.push(`/sites/${result.site.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the site");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        subtitle={`Operational site catalog centered on ${focusDateLabel} onward, with older windows still available only when you need archive context.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSiteDialogOpen(true)}>Add site</Button>
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          </div>
        }
      />

      <SystemViewRail views={siteViews} activeView={view} onSelect={setView} />

      <FilterBar>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by site name or code" className="md:max-w-sm" />
        <Select value={workstream} onChange={(event) => setWorkstream(event.target.value)} className="md:max-w-xs">
          <option value="">All workstreams</option>
          <option value="SDWAN">SD-WAN</option>
          <option value="SDA">SDA</option>
          <option value="WIRELESS">Wireless</option>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
        {view === "all-sites"
          ? "All active implementation months are visible, including older sites kept for reference."
          : view === "archived"
            ? "Archived or canceled sites live here. Restoring a site brings it back to active planning views."
            : `Past sites are hidden right now so the list stays focused on ${focusDateLabel} and later.`}
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="h-48 animate-pulse rounded-2xl border border-border bg-white" />)}</div>
      ) : siteCards.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {siteCards.map((site) => (
            <div key={site.id} className="rounded-2xl border border-border bg-card px-5 py-5 shadow-soft">
              {(() => {
                const unassignedLanes = site.technology_summaries
                  .filter((summary) => summary.total_tasks > 0 && !summary.owner_name)
                  .map((summary) => summary.label);

                return (
                  <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{site.site_code}</div>
                  <button
                    type="button"
                    onClick={() => openTracker(site.id, site.technology_summaries.find((item) => item.total_tasks > 0)?.key || "SDWAN")}
                    className="mt-2 block text-left text-xl font-semibold transition hover:text-slate-700"
                  >
                    {site.site_name}
                  </button>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {site.market}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="rounded-xl border border-border bg-slate-50 px-3 py-2 text-right text-sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Implementation</div>
                    <div className="mt-2 font-semibold">{site.next_migration_date ? format(parseDateOnly(site.next_migration_date), "MMM d, yyyy") : "TBD"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{windowStatusLabel(site.next_migration_date)}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTracker(site.id, site.technology_summaries.find((item) => item.total_tasks > 0)?.key || "SDWAN")}
                    >
                      Open tracker
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openImplementationDialog(site)}
                    >
                      Edit implementation
                    </Button>
                    <Button
                      variant={site.active ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => void toggleSiteActive(site, !site.active)}
                      disabled={patchSite.isPending}
                    >
                      {site.active ? "Remove site" : "Restore site"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Technology tabs from workbook</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {site.technology_summaries.map((summary) => (
                    <button
                      type="button"
                      key={summary.key}
                      onClick={() => openTracker(site.id, summary.key)}
                      className={`rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft ${
                        summary.total_tasks
                          ? "border-border bg-slate-50"
                          : "border-dashed border-slate-300 bg-slate-50/70"
                      }`}
                    >
                      <div className="text-sm font-semibold">{summary.label}</div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Owner</div>
                      <div className="mt-1 text-sm font-medium text-slate-700">{summary.owner_name || "Unassigned"}</div>
                      <div className="mt-3 inline-flex rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {technologyStateLabel(summary)}
                      </div>
                      <div className="mt-3 text-xs font-medium text-slate-600">
                        {summary.total_tasks ? "Open in tracker" : "Inspect tracker anyway"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                {unassignedLanes.length
                  ? `Needs owner: ${unassignedLanes.join(" / ")}`
                  : "All mapped technology lanes already have an owner."}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {site.workstreams.length ? (
                    site.workstreams.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => openTracker(site.id, item === "SD-WAN" ? "SDWAN" : item.toUpperCase())}
                        className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-white"
                      >
                        {item}
                      </button>
                    ))
                  ) : (
                    <span className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">No workstreams mapped</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Tap a technology card to jump straight into tracker activities.</div>
              </div>
                  </>
              )})()}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No sites matched" description="Adjust the filters, switch to All sites, or rerun the workbook-backed import if newer windows are missing." />
      )}

      <Dialog open={implementationDialogOpen} onOpenChange={setImplementationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit implementation date</DialogTitle>
            <DialogDescription>
              Move the site window forward or backward without rebuilding the site. This updates the primary implementation date shown across the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-5 py-5">
            <div className="text-sm font-medium text-slate-800">{implementationSite?.site_name || "Selected site"}</div>
            <Input type="date" value={implementationDate} onChange={(event) => setImplementationDate(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImplementationDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitImplementationDate} disabled={patchSite.isPending}>
                {patchSite.isPending ? "Saving..." : "Save implementation date"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
            <DialogDescription>Create a new site, set its implementation date, and seed the standard SD-WAN, SDA, and Wireless tracker lanes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-5 py-5">
            <Input
              value={siteForm.site_name}
              onChange={(event) => updateSiteForm("site_name", event.target.value)}
              placeholder="Site name"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={siteForm.site_code || ""}
                onChange={(event) => updateSiteForm("site_code", event.target.value)}
                placeholder="Site code (optional)"
              />
              <Input
                type="date"
                value={siteForm.scheduled_date}
                onChange={(event) => updateSiteForm("scheduled_date", event.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">SD-WAN owner</div>
                <Select
                  value={siteForm.sdwan_owner_id ? String(siteForm.sdwan_owner_id) : ""}
                  onChange={(event) => updateSiteForm("sdwan_owner_id", event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">No owner yet</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">SDA owner</div>
                <Select
                  value={siteForm.sda_owner_id ? String(siteForm.sda_owner_id) : ""}
                  onChange={(event) => updateSiteForm("sda_owner_id", event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">No owner yet</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Wireless owner</div>
                <Select
                  value={siteForm.wireless_owner_id ? String(siteForm.wireless_owner_id) : ""}
                  onChange={(event) => updateSiteForm("wireless_owner_id", event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">No owner yet</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id ?? ""}>{user.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-1">
              <Input value={siteForm.market} onChange={(event) => updateSiteForm("market", event.target.value)} placeholder="Market" />
            </div>
            <textarea
              value={siteForm.notes || ""}
              onChange={(event) => updateSiteForm("notes", event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:ring-2 focus:ring-ring/30"
              placeholder="Notes, implementation context, or dependency summary"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSiteDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitNewSite} disabled={createSite.isPending}>Create site</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
