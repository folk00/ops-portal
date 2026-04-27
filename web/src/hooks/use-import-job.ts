"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

interface JobStatus {
  kind?: string;
  status: string;
  progress?: string;
  result?: string;
  error?: string;
}

/**
 * Polls the `/api/jobs/{jobId}` endpoint until the job reaches
 * a terminal state (`done` | `failed`).
 *
 * Usage:
 *   const { data } = useImportJob(jobId);
 */
export function useImportJob(jobId: string | null) {
  return useQuery<JobStatus>({
    queryKey: ["job", jobId],
    queryFn: () => apiFetch<JobStatus>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "failed") return false;
      return 1500; // poll every 1.5 s while running
    },
  });
}
