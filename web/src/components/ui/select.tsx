import * as React from "react";

import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground shadow-sm outline-none transition focus:ring-2 focus:ring-ring/30",
      className
    )}
    {...props}
  />
));
Select.displayName = "Select";

