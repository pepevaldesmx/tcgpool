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
  const height = big ? "h-13" : "h-11";

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex">
        <div className="relative flex-1">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
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
            className={`${height} w-full rounded-l-pill border border-r-0 border-line-strong bg-surface pl-11 pr-3 text-ink outline-none transition placeholder:text-muted focus:border-accent ${
              big ? "text-base" : "text-[15px]"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => submit()}
          className={`${height} shrink-0 rounded-r-pill bg-accent px-7 text-[15px] font-bold text-accent-ink transition hover:brightness-110`}
        >
          Buscar
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lift">
          {suggestions.map((s, i) => (
            <li key={s.slug}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => submit(s)}
                className={`flex w-full items-center gap-3.5 px-4 py-3 text-left transition ${
                  i === highlight ? "bg-surface-2" : "hover:bg-hover"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.imageUrl ?? ""}
                  alt=""
                  className="h-12 w-9 shrink-0 rounded-md bg-surface-2 object-cover ring-1 ring-line"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{s.name}</span>
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
