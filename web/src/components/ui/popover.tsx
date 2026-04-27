"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, ...props }: PopoverPrimitive.PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content className={cn("z-50 w-72 rounded-xl border border-border bg-white p-3 shadow-panel", className)} sideOffset={8} {...props} />
    </PopoverPrimitive.Portal>
  );
}

