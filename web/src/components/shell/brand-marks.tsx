import { cn } from "@/lib/utils";

export function PortalMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 132"
      aria-hidden="true"
      className={cn("text-slate-700", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="20" width="100" height="92" rx="6" fill="currentColor" opacity="0.1" />
      <rect x="10" y="20" width="100" height="92" rx="6" stroke="currentColor" strokeWidth="3" />
      <rect x="26" y="40" width="68" height="6" rx="2" fill="currentColor" />
      <rect x="26" y="56" width="44" height="6" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="26" y="72" width="60" height="6" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="26" y="88" width="36" height="6" rx="2" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 50"
      aria-hidden="true"
      className={cn("text-slate-800", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="36"
        fill="currentColor"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="32"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        Ops Portal
      </text>
    </svg>
  );
}
