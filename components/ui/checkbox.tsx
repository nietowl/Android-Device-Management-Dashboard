import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={cn(
          "h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-2 focus:ring-offset-2 cursor-pointer bg-background",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };

