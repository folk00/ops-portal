"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className={cn("z-50 min-w-48 rounded-xl border border-border bg-white p-1 shadow-panel", className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) {
  return <DropdownMenuPrimitive.Item className={cn("flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-50", className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: DropdownMenuPrimitive.DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-50", className)} checked={checked} {...props}>
      <span className="flex h-4 w-4 items-center justify-center">{checked ? <Check className="h-3.5 w-3.5" /> : null}</span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

