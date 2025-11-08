import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | undefined>(undefined);

export interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export interface DropdownMenuTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function DropdownMenuTrigger({ asChild, children }: DropdownMenuTriggerProps) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

  const handleClick = () => {
    context.setOpen(!context.open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: handleClick } as any);
  }

  return (
    <button onClick={handleClick} className="outline-none">
      {children}
    </button>
  );
}

export interface DropdownMenuContentProps {
  align?: "start" | "end" | "center";
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuContent({
  align = "start",
  side = "bottom",
  children,
  className,
}: DropdownMenuContentProps) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuContent must be used within DropdownMenu");

  if (!context.open) return null;

  const alignClasses = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  };

  const sideClasses = {
    top: "bottom-full mb-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
    right: "left-full ml-2",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => context.setOpen(false)}
      />
      <div
        className={cn(
          "absolute z-50 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-card p-1 text-popover-foreground shadow-xl backdrop-blur-sm",
          alignClasses[align],
          sideClasses[side],
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

export interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  asChild?: boolean;
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  asChild,
}: DropdownMenuItemProps) {
  const context = React.useContext(DropdownMenuContext);

  const handleClick = () => {
    onClick?.();
    context?.setOpen(false);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: handleClick, className } as any);
  }

  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        className
      )}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

export interface DropdownMenuLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <div className={cn("px-3 py-2 text-sm font-semibold", className)}>
      {children}
    </div>
  );
}

export interface DropdownMenuSeparatorProps {
  className?: string;
}

export function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
  return <div className={cn("my-1 h-px bg-border", className)} />;
}

