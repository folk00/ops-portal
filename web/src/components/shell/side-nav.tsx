"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigation } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[160px] flex-col border-r border-[#b9d4df] bg-[linear-gradient(180deg,rgba(246,251,255,0.94),rgba(234,245,251,0.98))] px-2 py-3 backdrop-blur xl:w-[168px]">
      <div className="rounded-[26px] border border-[#0d3046]/10 bg-gradient-to-br from-[#051521] via-[#0a2437] to-[#0c3d57] px-2.5 py-2.5 text-white shadow-panel">
        <div className="flex items-start gap-3">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,250,255,0.96))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_32px_rgba(1,14,24,0.28)]">
            <img
              src="/brand/ops.png"
              alt="Ops"
              className="block h-full w-full object-contain"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <div className="min-w-0 pt-1">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#9ed8e3]">Ops Portal</div>
            <div className="mt-1 text-[13px] font-semibold leading-tight">Migration control surface</div>
            <div className="mt-2 text-[10px] leading-4.5 text-slate-300">Live workbook tracking and execution coordination.</div>
          </div>
        </div>
      </div>

      <nav className="mt-4 grid gap-1">
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                active
                  ? "bg-[#082032] text-white shadow-soft"
                  : "text-slate-600 hover:bg-[#e0f1f7] hover:text-[#0c2f43]"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-[#c2dce5] bg-[linear-gradient(180deg,rgba(252,255,255,0.95),rgba(234,245,250,0.98))] px-3 py-3 text-[11px] leading-5 text-muted-foreground">
        <div className="font-medium text-[#0c2f43]">Excel is import-only</div>
        <div className="mt-1">The portal runs from normalized PostgreSQL data and preserves raw workbook traceability on imported records.</div>
      </div>
    </aside>
  );
}
