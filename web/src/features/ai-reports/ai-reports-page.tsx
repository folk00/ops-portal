"use client";

import { PageHeader } from "@/components/shell/page-header";
import { SiteAiBriefCard } from "@/features/sites/site-ai-brief-card";

export function AiReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Reports"
        subtitle="Generate polished site briefs with any enabled model, without drilling into a site first. Pick the site, pick the model, and generate from one place."
      />

      <SiteAiBriefCard siteId={0} />
    </div>
  );
}
