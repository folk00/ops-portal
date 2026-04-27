import { cn } from "@/lib/utils";

export function FilterBar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-[#c7dde5] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,250,252,0.98))] px-4 py-3 shadow-soft md:flex-row md:flex-wrap md:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
