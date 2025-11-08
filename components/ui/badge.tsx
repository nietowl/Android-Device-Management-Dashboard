import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shadow-sm",
        {
          "border-primary bg-primary/10 text-primary": variant === "default",
          "border-border bg-secondary text-secondary-foreground": variant === "secondary",
          "border-red-500 bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400": variant === "destructive",
          "border-border bg-background text-foreground": variant === "outline",
          "border-green-500 bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400": variant === "success",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };

