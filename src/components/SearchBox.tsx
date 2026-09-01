"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

interface Suggestion {
  name: string;
  slug: string;
  imageUrl: string | null;
  storeCount: number;
  inStockCount: number;
  minPriceCents: number | null;
}

export default function SearchBox({
  initialQuery = "",
  autoFocus = false,
  size = "lg",
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  size?: "lg" | "sm";
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce simple: 150 ms sin teclear antes de pedir sugerencias.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sugerencias?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { results: Suggestion[] };
        setSuggestions(body.results);
        setHighlight(-1);
      } catch {
        /* petición cancelada: el usuario siguió tecleando */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function submit(target?: Suggestion) {
    setOpen(false);
    if (target) router.push(`/carta/${target.slug}`);
    else if (query.trim()) router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      submit(highlight >= 0 ? suggestions[highlight] : undefined);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const big = size === "lg";
  const height = big ? "h-12" : "h-10";

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex">
        <div className="relative flex-1">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Busca una carta… ej. Sol Ring"
            aria-label="Buscar carta"
            className={`${height} w-full rounded-l border border-r-0 border-line-strong bg-surface pl-10 pr-3 text-ink outline-none transition placeholder:text-muted focus:border-accent ${
              big ? "text-[15px]" : "text-sm"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => submit()}
          className={`${height} shrink-0 rounded-r bg-accent px-6 text-sm font-semibold text-accent-ink transition hover:brightness-110`}
        >
          Buscar
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1.5 w-full overflow-hidden rounded border border-line bg-surface shadow-lg shadow-ink/5">
          {suggestions.map((s, i) => (
            <li key={s.slug}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => submit(s)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  i === highlight ? "bg-surface-2" : "hover:bg-hover"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.imageUrl ?? ""}
                  alt=""
                  className="h-11 w-8 shrink-0 rounded-sm bg-surface-2 object-cover ring-1 ring-line"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {s.inStockCount > 0
                      ? `${s.storeCount} ${s.storeCount === 1 ? "tienda" : "tiendas"} · desde ${money(s.minPriceCents)}`
                      : "sin stock ahora"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
