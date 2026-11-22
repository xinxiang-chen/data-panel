"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  disabled
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-zinc-900" : "bg-zinc-200"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-1"
        )}
      />
    </button>
  );
}

