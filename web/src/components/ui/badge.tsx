import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]", {
  variants: {
    tone: {
      neutral: "border-slate-200 bg-white text-slate-700",
      blue: "border-sky-200 bg-sky-50 text-sky-700",
      green: "border-emerald-200 bg-emerald-50 text-emerald-700",
      amber: "border-amber-200 bg-amber-50 text-amber-700",
      red: "border-rose-200 bg-rose-50 text-rose-700",
      zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

