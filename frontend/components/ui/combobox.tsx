"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

export type ComboboxItem = {
  value: string;
  label: string;
  keywords?: string;
};

export function Combobox({
  id,
  value,
  onChange,
  items,
  placeholder,
  disabled
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: ComboboxItem[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedLabel = useMemo(() => items.find((i) => i.value === value)?.label ?? "", [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.value} ${i.keywords ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const listId = `${id}-listbox`;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        ref={inputRef}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) setOpen(true);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            const item = filtered[activeIndex];
            if (item) {
              e.preventDefault();
              onChange(item.value);
              setQuery(item.label);
              setActiveIndex(0);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(value ? selectedLabel : "");
            setActiveIndex(0);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        className={cn(
          "h-9 w-full rounded-md border border-zinc-200 bg-white pl-3 pr-8 text-sm outline-none focus:border-zinc-400",
          disabled && "opacity-50"
        )}
      />

      {!disabled && (query.length > 0 || value.length > 0) ? (
        <button
          type="button"
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          onClick={(e) => {
            e.preventDefault();
            setQuery("");
            setActiveIndex(0);
            if (value) onChange("");
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      ) : null}

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-sm"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === activeIndex;
              const selected = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-start px-3 py-2 text-left text-sm",
                    active ? "bg-zinc-100" : "bg-white",
                    selected ? "font-medium" : "font-normal"
                  )}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onChange(item.value);
                    setQuery(item.label);
                    setActiveIndex(0);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

