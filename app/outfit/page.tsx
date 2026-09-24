"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBack, IconChevronD, IconLock, IconMore, IconPlus, IconShuffle, IconSparkle, IconUnlock } from "@/components/icons";
import { ItemCard, ItemVisual } from "@/components/ItemVisual";
import { OutfitBoard } from "@/components/OutfitBoard";
import { Empty, Loading, Sheet } from "@/components/ui";
import { bodyFromPrefs, presetFromPrefs } from "@/lib/avatar/body";
import { todayISO, useStore } from "@/lib/store";
import {
  bySlot,
  combinationStats,
  generateOutfit,
  outfitTags,
  pureRandom,
  scoreOutfit,
  signature,
  toneKo,
  type Selection,
} from "@/lib/styling";
import { currentSeason, OCCASIONS, SLOTS, STYLES } from "@/lib/taxonomy";
import type { Body, Outfit, RenderOptions, Slot, WardrobeItem } from "@/lib/types";

// WebGL only exists in the browser.
const AvatarViewer = dynamic(() => import("@/components/three/AvatarViewer"), {
  ssr: false,
  loading: () => (
    <div className="relative h-full overflow-hidden rounded-lg bg-stage">
      <div className="shimmer absolute inset-0" />
    </div>
  ),
});

const SLOT_KO: Record<Slot, string> = { outer: "아우터", top: "상의", bottom: "하의", shoes: "신발", acc: "액세서리" };
const SLOT_EN: Record<Slot, string> = { outer: "OUTER", top: "TOP", bottom: "BOTTOM", shoes: "SHOES", acc: "ACC" };
const ORDER: Slot[] = ["outer", "top", "bottom", "shoes", "acc"];
const BODIES: { key: Body; ko: string }[] = [
  { key: "slim", ko: "SLIM" },
  { key: "standard", ko: "STANDARD" },
  { key: "relaxed", ko: "RELAXED" },
];

const stripReasons = (g: ReturnType<typeof generateOutfit>): Selection | null => {
  if (!g) return null;
  const { _reasons, ...s } = g;
  void _reasons;
  return s;
};

function Builder() {
  const router = useRouter();
  const { ready, items, outfits, prefs, itemById, saveOutfit, updateOutfit, wear, toast } = useStore();

  const groups = useMemo(() => bySlot(items), [items]);
  const [sel, setSel] = useState<Selection>({});
  const [active, setActive] = useState<Slot>("top");
  const [locked, setLocked] = useState<Set<Slot>>(new Set());
  const [source, setSource] = useState<Outfit["source"]>("manual");
  const [loaded, setLoaded] = useState<Outfit | null>(null);
  const [render, setRender] = useState<RenderOptions>({ body: "standard" });
  const [randomMode, setRandomMode] = useState<"smart" | "pure">("smart");
  const [modeMenu, setModeMenu] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const initDone = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);

  // Parametric avatar: preset (saved with the outfit) + the user's stature.
  const bodyParams = useMemo(() => bodyFromPrefs(prefs, render.body ?? presetFromPrefs(prefs)), [prefs, render.body]);

  // Keep selected pieces in sync with store updates (e.g. a cutout finished in the background).
  useEffect(() => {
    setSel((s) => {
      let changed = false;
      const n: Selection = {};
      for (const [k, v] of Object.entries(s) as [Slot, WardrobeItem][]) {
        const fresh = itemById.get(v.id);
        if (fresh && fresh !== v) changed = true;
        if (fresh) n[k] = fresh;
        else changed = true;
      }
      return changed ? n : s;
    });
  }, [itemById]);

  // ── initial state from URL (?outfit= | ?with= | ?top=…&bottom=…) ──
  useEffect(() => {
    if (!ready || initDone.current) return;
    initDone.current = true;
    const q = new URLSearchParams(window.location.search);
    const oid = q.get("outfit");
    const withId = q.get("with");
    const baseRender: RenderOptions = { body: presetFromPrefs(prefs) };
    setRender(baseRender);
    if (oid) {
      const o = outfits.find((x) => x.id === oid);
      if (o) {
        const s: Selection = {};
        for (const r of o.items) {
          const it = itemById.get(r.wardrobe_item_id);
          if (it) s[r.slot] = it;
        }
        setSel(s);
        setLoaded(o);
        setSource(o.source);
        // keep any legacy render keys (tuck / openOuter) so re-saving doesn't drop them
        setRender({ ...baseRender, ...(o.render ?? {}) });
        return;
      }
    }
    const fromParams: Selection = {};
    for (const s of SLOTS) {
      const id = q.get(s.key);
      const it = id ? itemById.get(id) : undefined;
      if (it) fromParams[s.key] = it;
    }
    if (Object.keys(fromParams).length) {
      setSel(fromParams);
      return;
    }
    if (withId && itemById.get(withId)) {
      const it = itemById.get(withId)!;
      const slot = SLOTS.find((s) => s.category === it.category)?.key;
      const s = stripReasons(generateOutfit(items, { favorItemId: withId, prefs }));
      if (s) setSel(s);
      if (slot) {
        setActive(slot);
        setLocked(new Set([slot]));
      }
      setSource("random");
      return;
    }
    const s = stripReasons(generateOutfit(items, { prefs, favorDormant: true }));
    if (s) {
      setSel(s);
      setSource("random");
    }
  }, [ready, outfits, itemById, items, prefs]);

  const list = groups[active];
  const cur = sel[active];
  const idx = cur ? list.findIndex((x) => x.id === cur.id) : -1;

  const setSlot = useCallback((slot: Slot, it: WardrobeItem | undefined) => {
    setSel((s) => {
      const n = { ...s };
      if (it) n[slot] = it;
      else delete n[slot];
      return n;
    });
    setSource("manual");
  }, []);

  /** Cycle the active slot through its items; index -1 = none. */
  const step = useCallback(
    (d: 1 | -1) => {
      if (!list.length) return;
      const n = list.length + 1;
      const next = ((((idx + 1 + d) % n) + n) % n) - 1;
      setSlot(active, next === -1 ? undefined : list[next]);
    },
    [list, idx, active, setSlot],
  );

  const toggleLock = (s: Slot) =>
    setLocked((l) => {
      const n = new Set(l);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const savedSigs = useMemo(() => new Set(outfits.map((o) => o.items.map((r) => r.wardrobe_item_id).sort().join("|"))), [outfits]);

  const randomize = (mode = randomMode) => {
    const lock: Partial<Record<Slot, WardrobeItem | null>> = {};
    for (const s of locked) lock[s] = sel[s] ?? null;
    if (mode === "pure") {
      setSel(pureRandom(items, lock));
      setSource("random");
      return;
    }
    // Smart: harmony-scored, respects locks, avoids the current look and already-saved outfits.
    const exclude = new Set(savedSigs);
    exclude.add(signature(sel));
    const s = stripReasons(generateOutfit(items, { prefs, locked: lock, exclude, samples: 140 }));
    if (s) {
      setSel(s);
      setSource("random");
    }
  };

  const tryOn = () => toast("AI TRY-ON은 다음 단계(Phase 6)에서 연결돼요");

  // Keep the selected card centred in the horizontal strip (without scrolling the page).
  useEffect(() => {
    const box = stripRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-sel="true"]`);
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [active, cur?.id]);

  // Keyboard: ←/→ cycle · ↑/↓ slot · R random · L lock
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select") || saveOpen || optsOpen) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowDown") setActive(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(active) + 1)]);
      else if (e.key === "ArrowUp") setActive(ORDER[Math.max(0, ORDER.indexOf(active) - 1)]);
      else if (e.key.toLowerCase() === "r") randomize();
      else if (e.key.toLowerCase() === "l") toggleLock(active);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const stats = useMemo(() => combinationStats(items), [items]);
  const tags = useMemo(() => outfitTags(sel), [sel]);
  const reasons = useMemo(() => scoreOutfit(sel, { season: currentSeason(), prefs }).reasons, [sel, prefs]);
  const count = Object.keys(sel).length;
  const loadedSig = loaded ? loaded.items.map((r) => r.wardrobe_item_id).sort().join("|") : null;
  const duplicate = savedSigs.has(signature(sel)) && signature(sel) !== loadedSig;

  if (!ready) return <Loading />;
  if (!groups.top.length && !groups.bottom.length)
    return (
      <div className="pt-2">
        <h1 className="display mb-5 text-[20px]">OUTFIT BUILDER</h1>
        <Empty
          title="조합할 옷이 부족해요"
          body="상의와 하의를 한 벌씩만 등록해도 3D 아바타로 코디를 시작할 수 있어요."
          action={
            <Link href="/add" className="btn btn-dark">
              <IconPlus width={16} height={16} /> 옷 추가
            </Link>
          }
        />
      </div>
    );

  const activeLabel = SLOT_KO[active];

  /* ─────────── pieces ─────────── */

  // The look, as labels over the 3D stage: [BLACK TEE] [BEIGE PANTS] …
  const lookOverlay = (
    <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[62%] flex-col items-start gap-1 lg:left-3 lg:top-3">
      {ORDER.filter((s) => sel[s]).map((s) => (
        <button
          key={s}
          onClick={() => setActive(s)}
          className={`pointer-events-auto flex max-w-full items-center gap-1.5 rounded border bg-paper/90 px-2 py-1 text-left shadow-sm backdrop-blur transition ${
            active === s ? "border-ink" : "border-line"
          }`}
        >
          <span className="text-[9px] font-bold tracking-[0.08em] text-mute">{SLOT_EN[s]}</span>
          <span className="truncate text-[11px] font-semibold">{sel[s]!.name}</span>
          {locked.has(s) && <IconLock width={10} height={10} strokeWidth={2.2} className="shrink-0" />}
        </button>
      ))}
    </div>
  );

  const stage = (
    <AvatarViewer
      body={bodyParams}
      outfit={sel}
      overlay={lookOverlay}
      className="h-[min(58dvh,540px)] min-h-[360px] lg:h-[min(80dvh,760px)]"
    />
  );

  const categoryTabs = (
    <div className="flex border-b border-line">
      {ORDER.map((s) => {
        const on = active === s;
        return (
          <button
            key={s}
            onClick={() => setActive(s)}
            aria-pressed={on}
            className={`-mb-px flex flex-1 items-center justify-center gap-1 border-b-2 py-3 text-[11.5px] font-bold tracking-[0.06em] transition ${
              on ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {SLOT_EN[s]}
            {locked.has(s) && <IconLock width={10} height={10} strokeWidth={2.2} />}
          </button>
        );
      })}
    </div>
  );

  const noneCard = (compact: boolean) => (
    <button data-sel={!cur} onClick={() => setSlot(active, undefined)} className={`${compact ? "w-[84px] shrink-0 snap-start" : ""} text-left`}>
      <div
        className={`grid aspect-[5/6] place-items-center rounded-md border text-[12px] ${
          !cur ? "border-ink font-semibold text-ink" : "border-dashed border-line-2 text-mute"
        }`}
      >
        없음
      </div>
      <p className="mt-1.5 text-[11.5px] font-semibold text-mute">{activeLabel} 벗기기</p>
    </button>
  );

  const emptyList = (
    <div className="rounded-md border border-dashed border-line-2 py-9 text-center text-[13px] text-mute">
      등록된 {activeLabel}가 없어요.{" "}
      <Link href={`/add?category=${SLOTS.find((x) => x.key === active)!.category}`} className="font-semibold text-ink underline">
        추가하기
      </Link>
    </div>
  );

  const selectedRow = (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-[13px] font-bold">{cur ? cur.name : `${activeLabel} 없음`}</p>
      <button
        onClick={() => toggleLock(active)}
        aria-pressed={locked.has(active)}
        className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-[12px] font-semibold transition ${
          locked.has(active) ? "border-ink bg-ink text-paper" : "border-line text-ink-2"
        }`}
      >
        {locked.has(active) ? <IconLock width={13} height={13} strokeWidth={2} /> : <IconUnlock width={13} height={13} strokeWidth={2} />}
        {locked.has(active) ? "고정됨" : "고정"}
      </button>
      <button aria-label="아바타 옵션" onClick={() => setOptsOpen(true)} className="grid h-8 w-8 place-items-center rounded-md border border-line">
        <IconMore width={18} height={18} />
      </button>
    </div>
  );

  const actions = (
    <div className="flex gap-2">
      <div className="relative flex flex-1">
        <button className="btn btn-line flex-1 rounded-r-none" onClick={() => randomize()}>
          <IconShuffle width={17} height={17} /> {randomMode === "pure" ? "PURE RANDOM" : "RANDOM"}
        </button>
        <button aria-label="랜덤 방식" className="btn btn-line rounded-l-none border-l-0 px-2.5" onClick={() => setModeMenu((x) => !x)}>
          <IconChevronD width={15} height={15} />
        </button>
        {modeMenu && (
          <div className="absolute bottom-[52px] left-0 z-30 w-full overflow-hidden rounded-md border border-line bg-paper shadow-lg">
            {(
              [
                ["smart", "RANDOM", "색 조화·계절·스타일·고정 옷을 고려"],
                ["pure", "PURE RANDOM", "고정 옷만 유지하고 완전 무작위"],
              ] as const
            ).map(([k, t, d]) => (
              <button
                key={k}
                onClick={() => {
                  setRandomMode(k);
                  setModeMenu(false);
                  randomize(k);
                }}
                className={`block w-full px-3 py-2.5 text-left hover:bg-card ${randomMode === k ? "bg-card" : ""}`}
              >
                <span className="text-[12px] font-bold">{t}</span>
                <span className="block text-[11px] text-mute">{d}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-dark flex-1" disabled={count < 2} onClick={tryOn}>
        <IconSparkle width={16} height={16} /> AI TRY-ON
      </button>
    </div>
  );

  const comboLine = stats.total > 0 && (
    <p className="text-center text-[12px] text-mute">
      지금 옷장으로 만들 수 있는 조합 <b className="text-ink">{stats.total.toLocaleString()}</b>가지
      <span className="mx-1 text-line-2">|</span>
      잘 어울리는 조합 <b className="text-ink">{stats.estimated ? "약 " : ""}{stats.good.toLocaleString()}</b>가지
    </p>
  );

  const info = (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-bold">현재 코디</p>
        {source === "random" && <span className="text-[10.5px] font-semibold text-mute">RANDOM</span>}
      </div>
      <p className="mt-1 text-[11px] font-semibold tracking-[0.06em] text-mute">{[...tags.styles, tags.tone].filter(Boolean).join(" · ") || "—"}</p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {ORDER.map((s) => {
          const it = sel[s];
          return (
            <li key={s} className={`flex items-center gap-2.5 py-2 ${active === s ? "bg-card/60" : ""}`}>
              <button onClick={() => setActive(s)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-card p-1">
                  {it ? <ItemVisual item={it} /> : <span className="h-3 w-3 rounded-full border border-dashed border-mute/50" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10.5px] text-mute">{SLOT_KO[s]}</span>
                  <span className={`block truncate text-[12.5px] ${it ? "font-semibold" : "text-mute"}`}>{it ? it.name : "없음"}</span>
                </span>
              </button>
              <button
                aria-label={`${SLOT_KO[s]} 고정`}
                onClick={() => toggleLock(s)}
                className={`grid h-7 w-7 place-items-center rounded ${locked.has(s) ? "bg-ink text-paper" : "text-mute hover:text-ink"}`}
              >
                {locked.has(s) ? <IconLock width={13} height={13} strokeWidth={2} /> : <IconUnlock width={13} height={13} />}
              </button>
            </li>
          );
        })}
      </ul>
      {count >= 2 && reasons.length > 0 && (
        <div className="mt-2">
          <button className="text-[11.5px] text-mute underline underline-offset-2" onClick={() => setWhy((x) => !x)}>
            {why ? "설명 닫기" : "왜 이 조합?"}
          </button>
          {why && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{reasons.join(" · ")}</p>}
        </div>
      )}
    </div>
  );

  const itemGrid = (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 xl:grid-cols-4">
      {noneCard(false)}
      {list.map((it) => (
        <div key={it.id} data-sel={cur?.id === it.id}>
          <ItemCard item={it} size="sm" meta="none" selected={cur?.id === it.id} onClick={() => setSlot(active, it)} />
          <p className={`mt-1.5 truncate text-[11.5px] ${cur?.id === it.id ? "font-bold" : "text-ink-2"}`}>{it.name}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* header */}
      <div className="-mx-4 mb-3 flex h-11 items-center justify-between px-4 lg:mx-0 lg:mb-5 lg:h-auto lg:px-0">
        <button onClick={() => router.back()} className="-ml-1.5 p-1.5 lg:hidden" aria-label="뒤로">
          <IconBack width={20} height={20} />
        </button>
        <div className="text-center lg:text-left">
          <h1 className="text-[15px] font-extrabold tracking-[0.02em] lg:text-[18px]">OUTFIT BUILDER</h1>
          {loaded && <p className="text-[11px] text-mute">편집 중 · {loaded.name}</p>}
        </div>
        <button onClick={() => setSaveOpen(true)} disabled={count < 2} className="text-[13px] font-bold tracking-[0.04em] disabled:opacity-40 lg:hidden">
          SAVE
        </button>
        <button onClick={() => setSaveOpen(true)} disabled={count < 2} className="btn btn-dark btn-sm hidden lg:inline-flex">
          SAVE
        </button>
      </div>

      {/* One 3D stage (one WebGL context) for every breakpoint.
          Mobile: stage → tabs → strip → actions · Desktop: stage | wardrobe panel */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-5">
        {stage}

        <div className="lg:hidden">
          <div className="mt-2">{categoryTabs}</div>
          <div ref={stripRef} className="no-scrollbar relative -mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {list.length === 0 ? (
              <div className="w-full">{emptyList}</div>
            ) : (
              <>
                {noneCard(true)}
                {list.map((it) => (
                  <div key={it.id} data-sel={cur?.id === it.id} className="w-[84px] shrink-0 snap-start">
                    <ItemCard item={it} size="xs" meta="none" selected={cur?.id === it.id} onClick={() => setSlot(active, it)} />
                    <p className={`mt-1.5 truncate text-[11.5px] ${cur?.id === it.id ? "font-bold" : "text-ink-2"}`}>{it.name}</p>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="mt-3">{selectedRow}</div>
          <div className="mt-4">{actions}</div>
          <div className="mt-3">{comboLine}</div>
        </div>

        <div className="hidden h-[min(80dvh,760px)] flex-col rounded-lg border border-line lg:flex">
          <div className="px-3">{categoryTabs}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{list.length === 0 ? emptyList : itemGrid}</div>
          <div className="space-y-3 border-t border-line p-3">
            {selectedRow}
            {actions}
            <p className="text-[10.5px] text-mute">← → 옷 변경 · ↑ ↓ 카테고리 · R 랜덤 · L 고정 · 드래그 회전 · 휠 줌</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-line p-4 lg:mt-5">{info}</div>
        <div className="hidden self-start lg:mt-5 lg:block">{comboLine}</div>
      </div>

      {/* avatar options */}
      <Sheet open={optsOpen} onClose={() => setOptsOpen(false)} title="아바타 옵션">
        <div className="py-2">
          <b className="block text-[14px] font-semibold">체형</b>
          <p className="text-[12px] text-mute">키는 프로필의 신장({bodyParams.height}cm)을 사용해요. 코디와 함께 저장돼요.</p>
          <div className="mt-3 flex gap-1.5">
            {BODIES.map((b) => (
              <button key={b.key} className="chip" data-on={render.body === b.key} onClick={() => setRender({ ...render, body: b.key })}>
                {b.ko}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <SaveModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        sel={sel}
        render={render}
        loaded={loaded}
        duplicate={duplicate}
        tags={[...tags.styles.map((x) => STYLES.find((st) => st.key === x.toLowerCase())?.ko ?? x), ...(tags.tone ? [toneKo(tags.tone)!] : [])]}
        onSave={async (meta, mode) => {
          const refs = ORDER.filter((s) => sel[s]).map((slot) => ({ slot, wardrobe_item_id: sel[slot]!.id }));
          const o =
            mode === "update" && loaded
              ? await updateOutfit(loaded.id, { ...meta, items: refs, render })
              : await saveOutfit({ ...meta, source, items: refs, render });
          setLoaded(o);
          setSaveOpen(false);
          return o;
        }}
        onWear={async (o) => {
          await wear(o.items.map((r) => r.wardrobe_item_id), o.id, o.outfit_date && o.outfit_date <= todayISO() ? o.outfit_date : todayISO());
          router.push("/outfits");
        }}
        toast={toast}
      />
    </div>
  );
}

const STYLE_OPTS = STYLES.filter((s) => s.key !== "formal");

function autoName(sel: Selection) {
  const parts = [sel.outer ?? sel.top, sel.bottom].filter(Boolean).map((i) => i!.name.split(" ").slice(-2).join(" "));
  return parts.join(" + ") || "새 코디";
}

function SaveModal({
  open,
  onClose,
  sel,
  render,
  loaded,
  duplicate,
  tags,
  onSave,
  onWear,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  sel: Selection;
  render: RenderOptions;
  loaded: Outfit | null;
  duplicate: boolean;
  tags: string[];
  onSave: (meta: { name: string; occasion: string; style: string[]; outfit_date: string | null; note: string | null }, mode: "new" | "update") => Promise<Outfit>;
  onWear: (o: Outfit) => Promise<void>;
  toast: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("casual");
  const [occasion, setOccasion] = useState("daily");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pieces = Object.values(sel).filter(Boolean) as WardrobeItem[];
    const freq = new Map<string, number>();
    for (const p of pieces) for (const s of p.style) freq.set(s, (freq.get(s) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    setName(loaded?.name ?? "");
    setStyle(loaded?.style[0] ?? top ?? "casual");
    setOccasion(loaded?.occasion ?? "daily");
    setDate(loaded?.outfit_date ?? todayISO());
    setNote(loaded?.note ?? "");
  }, [open, loaded, sel]);

  const run = async (mode: "new" | "update", thenWear = false) => {
    setBusy(true);
    try {
      const o = await onSave({ name: name.trim() || autoName(sel), occasion, style: [style], outfit_date: date || null, note: note.trim() || null }, mode);
      if (thenWear) await onWear(o);
      else toast(mode === "update" ? "코디를 수정했어요" : "MY OUTFITS에 저장했어요");
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const hashtags = [
    STYLES.find((s) => s.key === style)?.ko,
    OCCASIONS.find((o) => o.key === occasion)?.ko,
    ...tags,
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  return (
    <Sheet open={open} onClose={onClose} title="코디 저장하기" wide>
      <div className="flex gap-4">
        <div className="w-[108px] shrink-0 sm:w-[132px]">
          <OutfitBoard sel={sel} render={render} aspect="aspect-[3/4.4]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold">코디 이름</span>
            <input className="field" value={name} placeholder={autoName(sel)} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold">스타일</span>
              <select className="field" value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLE_OPTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.ko}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold">상황</span>
              <select className="field" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                {OCCASIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.ko}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold">날짜</span>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-semibold">
          메모 <span className="font-normal text-mute">(선택)</span>
        </span>
        <textarea className="field h-[68px] py-2.5" placeholder="간단한 메모를 입력하세요." value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {hashtags.map((h) => (
          <span key={h} className="rounded bg-card px-2 py-1 text-[11px] text-ink-2">
            #{h}
          </span>
        ))}
      </div>
      {duplicate && <p className="mt-3 rounded bg-card px-3 py-2 text-[12px] text-ink-2">이미 같은 조합이 저장돼 있어요. 그래도 저장할 수 있어요.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button className="btn btn-line" onClick={onClose} disabled={busy}>
          취소
        </button>
        <button className="btn btn-dark" disabled={busy} onClick={() => run(loaded ? "update" : "new")}>
          {loaded ? "수정 저장" : "저장하기"}
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-4 text-[12px] text-mute">
        {loaded && (
          <button className="underline underline-offset-2" disabled={busy} onClick={() => run("new")}>
            새 코디로 저장
          </button>
        )}
        <button className="underline underline-offset-2" disabled={busy} onClick={() => run(loaded ? "update" : "new", true)}>
          저장하고 {date && date < todayISO() ? "이 날 입음으로 기록" : "오늘 입기"}
        </button>
      </div>
    </Sheet>
  );
}

export default function OutfitPage() {
  return (
    <Suspense>
      <Builder />
    </Suspense>
  );
}
