import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-slate-50 px-6 text-center">
      <Inbox className="h-10 w-10 text-slate-400" />
      <div className="mt-4 text-lg font-semibold">{title}</div>
      <div className="mt-2 max-w-lg text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

