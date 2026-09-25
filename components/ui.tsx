"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { colorDef } from "@/lib/taxonomy";
import { IconChevronL, IconChevronR, IconClose } from "./icons";

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  wrap = true,
}: {
  options: { key: T; ko: string }[];
  value: T | T[] | null;
  onChange: (v: T | T[] | null) => void;
  multiple?: boolean;
  wrap?: boolean;
}) {
  const sel = Array.isArray(value) ? value : value ? [value] : [];
  const chips = options.map((o) => {
    const on = sel.includes(o.key);
    return (
      <button
        type="button"
        key={o.key}
        className="chip shrink-0"
        data-on={on}
        onClick={() => {
          if (multiple) onChange(on ? sel.filter((x) => x !== o.key) : [...sel, o.key]);
          else onChange(on ? null : o.key);
        }}
      >
        {o.ko}
      </button>
    );
  });
  if (wrap) return <div className="flex flex-wrap gap-2">{chips}</div>;
  return <ScrollRow>{chips}</ScrollRow>;
}

/**
 * One horizontal row that scrolls sideways: a slim scrollbar, arrow buttons at the edges while there is
 * more to see, and the mouse wheel scrolls it (a mouse can't swipe).
 */
export function ScrollRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // vertical wheel → sideways, only while the row can still move that way (so the page keeps scrolling otherwise)
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [update]);

  const step = (d: 1 | -1) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = "absolute top-0 z-10 flex h-9 w-9 items-center from-paper via-paper/90 to-transparent";

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className="scroll-row flex gap-2 overflow-x-auto pb-2">
        {children}
      </div>
      {edge.left && (
        <button type="button" aria-label="왼쪽으로 넘기기" onClick={() => step(-1)} className={`${arrow} left-0 justify-start bg-gradient-to-r`}>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-paper shadow-sm">
            <IconChevronL width={14} height={14} />
          </span>
        </button>
      )}
      {edge.right && (
        <button type="button" aria-label="오른쪽으로 넘기기" onClick={() => step(1)} className={`${arrow} right-0 justify-end bg-gradient-to-l`}>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-paper shadow-sm">
            <IconChevronR width={14} height={14} />
          </span>
        </button>
      )}
    </div>
  );
}

export function ColorDot({ color, size = 14, ring = false }: { color: string; size?: number; ring?: boolean }) {
  const c = colorDef(color);
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: c.hex,
        boxShadow: ring ? "0 0 0 2px var(--color-paper), 0 0 0 3.5px var(--color-ink)" : "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    />
  );
}

export function ColorPicker({
  options,
  value,
  onChange,
  multiple = false,
  allowNone = false,
}: {
  options: { key: string; ko: string; hex: string }[];
  value: string | string[] | null;
  onChange: (v: string | string[] | null) => void;
  multiple?: boolean;
  allowNone?: boolean;
}) {
  const sel = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-2">
      {allowNone && (
        <button type="button" onClick={() => onChange(null)} className="flex w-[52px] flex-col items-center gap-1">
          <span
            className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-mute text-[10px] text-mute"
            style={sel.length === 0 ? { boxShadow: "0 0 0 2px var(--color-paper), 0 0 0 3.5px var(--color-ink)" } : undefined}
          >
            ✕
          </span>
          <span className="text-[10.5px] text-mute">없음</span>
        </button>
      )}
      {options.map((c) => {
        const on = sel.includes(c.key);
        return (
          <button
            type="button"
            key={c.key}
            aria-pressed={on}
            onClick={() => {
              if (multiple) onChange(on ? sel.filter((x) => x !== c.key) : [...sel, c.key]);
              else onChange(c.key);
            }}
            className="flex w-[52px] flex-col items-center gap-1"
          >
            <ColorDot color={c.key} size={28} ring={on} />
            <span className={`text-[10.5px] ${on ? "font-semibold text-ink" : "text-mute"}`}>{c.ko}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="py-3.5">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        {hint && <span className="text-[11px] text-mute">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal>
      <button aria-label="닫기" className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={`sheet-up relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-paper px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 lg:pb-5 lg:rounded-lg lg:px-6 lg:pt-5 ${
          wide ? "lg:max-w-[560px]" : "lg:max-w-md"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button onClick={onClose} className="-mr-2 p-2" aria-label="닫기">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pb-4 pt-1">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="display text-[22px] lg:text-[26px]">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
      <p className="display text-[18px]">{title}</p>
      {body && <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-mute">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid grid-cols-2 gap-4 pt-16 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-md bg-card">
          <div className="shimmer absolute inset-0" />
        </div>
      ))}
    </div>
  );
}
