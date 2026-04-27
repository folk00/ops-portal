"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Connects to the SSE endpoint and automatically invalidates
 * React-Query caches when the server pushes relevant events.
 *
 * Drop this into a layout-level component so the connection
 * stays open for the entire session:
 *
 *   useEventStream();
 */
export function useEventStream() {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);

  const connect = useCallback(() => {
    if (sourceRef.current) return;

    const es = new EventSource("/api/events");
    sourceRef.current = es;

    const invalidateOperationalQueries = () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-updates"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    };

    const handlePayload = (payload: string, eventType = "message") => {
      try {
        const data = JSON.parse(payload);

        if (
          eventType === "task_updated" ||
          eventType === "tasks_bulk_updated" ||
          eventType === "task_update_created"
        ) {
          invalidateOperationalQueries();
          return;
        }

        if (data.status === "done") {
          invalidateOperationalQueries();
        }
      } catch {
        // ignore non-JSON keep-alive comments
      }
    };

    es.onopen = () => {
      retryRef.current = 0;
    };

    es.addEventListener("message", (ev) => {
      handlePayload(ev.data, "message");
    });
    es.addEventListener("task_updated", (ev) => handlePayload(ev.data, "task_updated"));
    es.addEventListener("tasks_bulk_updated", (ev) => handlePayload(ev.data, "tasks_bulk_updated"));
    es.addEventListener("task_update_created", (ev) => handlePayload(ev.data, "task_update_created"));

    es.onerror = () => {
      es.close();
      sourceRef.current = null;
      // Exponential back-off capped at 30 s
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current += 1;
      setTimeout(connect, delay);
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [connect]);
}
