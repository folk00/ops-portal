import { Suspense } from "react";

import { TrackerPage } from "@/features/tracker/tracker-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-[720px] animate-pulse rounded-2xl border border-border bg-white" />}>
      <TrackerPage />
    </Suspense>
  );
}
