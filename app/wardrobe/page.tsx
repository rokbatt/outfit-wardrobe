"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconPlus, IconSearch, IconSliders, IconTrash } from "@/components/icons";
import { garmentSource } from "@/lib/garment";
import { ItemCard } from "@/components/ItemVisual";
import { ChipGroup, ColorPicker, Empty, Field, Loading, Sheet } from "@/components/ui";
import { useStore } from "@/lib/store";
import { daysSince, dormantItems } from "@/lib/styling";
import { CATEGORIES, COLORS, SEASONS, STYLES } from "@/lib/taxonomy";
import type { Category, Season } from "@/lib/types";

type Sort = "recent" | "most" | "least" | "stale";
const SORTS: { key: Sort; ko: string }[] = [
  { key: "recent", ko: "최근 추가순" },
  { key: "most", ko: "많이 입은 순" },
  { key: "least", ko: "적게 입은 순" },
  { key: "stale", ko: "오래 안 입은 순" },
];

interface Filters {
  colors: string[];
  seasons: Season[];
  styles: string[];
  brands: string[];
  dormant: boolean;
}
const NO_FILTERS: Filters = { colors: [], seasons: [], styles: [], brands: [], dormant: false };
type Panel = "all" | "color" | "season" | "style" | "brand" | null;

export default function WardrobePage() {
  const { ready, items, seedSample, deleteItems, toast } = useStore();
  // multi-select delete mode
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // photo-less items (the sample closet) are drawn as illustrations
  const drawnIds = useMemo(() => items.filter((i) => garmentSource(i).kind === "none").map((i) => i.id), [items]);
  const [cat, setCat] = useState<Category | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [panel, setPanel] = useState<Panel>(null);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c");
    if (c && CATEGORIES.some((x) => x.key === c)) setCat(c as Category);
    if (q.get("search")) setSearch("");
  }, []);
  useEffect(() => {
    if (search === "") searchRef.current?.focus();
  }, [search]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [items]);
  const brands = useMemo(() => [...new Set(items.map((i) => i.brand).filter((b): b is string => !!b))].sort(), [items]);
  const presentColors = useMemo(() => COLORS.filter((c) => items.some((i) => i.color === c.key)), [items]);
  const dormantIds = useMemo(() => new Set(dormantItems(items).map((i) => i.id)), [items]);

  const list = useMemo(() => {
    const q = search?.trim().toLowerCase();
    const out = items.filter(
      (i) =>
        (cat === "all" || i.category === cat) &&
        (!q || [i.name, i.subcategory, i.brand ?? ""].some((t) => t.toLowerCase().includes(q))) &&
        (!f.colors.length || f.colors.includes(i.color) || (i.secondary_color && f.colors.includes(i.secondary_color))) &&
        (!f.seasons.length || i.season.some((s) => f.seasons.includes(s))) &&
        (!f.styles.length || i.style.some((s) => f.styles.includes(s))) &&
        (!f.brands.length || (i.brand && f.brands.includes(i.brand))) &&
        (!f.dormant || dormantIds.has(i.id)),
    );
    const stale = (x: (typeof items)[number]) => daysSince(x.last_worn_at) ?? 10_000;
    if (sort === "most") out.sort((a, b) => b.wear_count - a.wear_count);
    if (sort === "least") out.sort((a, b) => a.wear_count - b.wear_count);
    if (sort === "stale") out.sort((a, b) => stale(b) - stale(a));
    return out;
  }, [items, cat, f, sort, dormantIds, search]);

  if (!ready) return <Loading />;

  const dropChip = (key: Exclude<Panel, "all" | null>, label: string, n: number) => (
    <button className="chip chip-drop shrink-0" data-on={n > 0} onClick={() => setPanel(key)}>
      {label}
      {n > 0 ? ` ${n}` : ""}
    </button>
  );

  return (
    <div>
      {picked ? (
        <header className="flex h-11 items-center justify-between lg:mb-2">
          <h1 className="text-[18px] font-bold lg:text-[22px]">{picked.size}개 선택</h1>
          <div className="flex items-center gap-1.5">
            {drawnIds.length > 0 && (
              <button className="btn btn-line btn-sm" onClick={() => setPicked(new Set(drawnIds))}>
                그림 옷 전체 선택 ({drawnIds.length})
              </button>
            )}
            <button
              className="btn btn-line btn-sm"
              onClick={() => setPicked(picked.size === list.length ? new Set() : new Set(list.map((i) => i.id)))}
            >
              {picked.size === list.length && list.length > 0 ? "선택 해제" : "전체 선택"}
            </button>
            <button aria-label="선택 취소" className="p-2" onClick={() => setPicked(null)}>
              <IconClose width={21} height={21} />
            </button>
          </div>
        </header>
      ) : (
      <header className="flex h-11 items-center justify-between lg:mb-2">
        <h1 className="text-[18px] font-bold lg:text-[22px]">내 옷장</h1>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button aria-label="선택해서 삭제" className="p-2" onClick={() => setPicked(new Set())}>
              <IconTrash width={21} height={21} />
            </button>
          )}
          <button aria-label="검색" className="p-2" onClick={() => setSearch((s) => (s === null ? "" : null))}>
            {search === null ? <IconSearch width={21} height={21} /> : <IconClose width={21} height={21} />}
          </button>
          <button aria-label="필터" className="p-2" onClick={() => setPanel("all")}>
            <IconSliders width={21} height={21} />
          </button>
          <Link href={cat !== "all" ? `/add?category=${cat}` : "/add"} className="btn btn-dark btn-sm ml-1 hidden sm:inline-flex">
            <IconPlus width={15} height={15} /> 옷 추가
          </Link>
        </div>
      </header>
      )}

      {search !== null && (
        <input
          ref={searchRef}
          className="field mb-3"
          placeholder="이름, 종류, 브랜드로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {items.length === 0 ? (
        <Empty
          title="옷장이 비어 있어요"
          body="자주 입는 옷 5벌부터 찍어보세요. 배경은 자동으로 지워지고, 바로 마네킹에 입혀볼 수 있어요."
          action={
            <div className="flex flex-col items-center gap-3">
              <Link href="/add" className="btn btn-dark">
                <IconPlus width={16} height={16} /> 첫 옷 추가하기
              </Link>
              <button
                className="text-[12.5px] text-mute underline underline-offset-4"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  await seedSample();
                  setSeeding(false);
                }}
              >
                {seeding ? "불러오는 중…" : "샘플 옷장으로 먼저 둘러보기"}
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="sticky top-0 z-20 -mx-4 bg-paper/95 px-4 pb-2.5 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {[{ key: "all" as const, ko: "전체" }, ...CATEGORIES].map((c) => {
                const n = c.key === "all" ? items.length : counts.get(c.key) ?? 0;
                return (
                  <button key={c.key} className="chip shrink-0" data-on={cat === c.key} onClick={() => setCat(c.key)}>
                    {c.ko}
                    <span className={`text-[11px] ${cat === c.key ? "text-paper/60" : "text-mute"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="no-scrollbar -mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {dropChip("color", "색상", f.colors.length)}
              {dropChip("season", "계절", f.seasons.length)}
              {dropChip("style", "스타일", f.styles.length)}
              {brands.length > 0 && dropChip("brand", "브랜드", f.brands.length)}
              <button className="chip shrink-0" data-on={f.dormant} onClick={() => setF((x) => ({ ...x, dormant: !x.dormant }))}>
                잠든 옷
              </button>
              <select
                aria-label="정렬"
                className="ml-auto shrink-0 bg-transparent pl-2 text-[12px] font-semibold text-ink-2 outline-none"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.ko}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mb-2 mt-1 text-[12px] text-mute">{list.length}개</p>
          {list.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-mute">
              조건에 맞는 옷이 없어요.{" "}
              <button
                className="underline"
                onClick={() => {
                  setF(NO_FILTERS);
                  setSearch(null);
                }}
              >
                초기화
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-5 lg:gap-x-3 xl:grid-cols-6">
              {list.map((i) =>
                picked ? (
                  <ItemCard
                    key={i.id}
                    item={i}
                    onClick={() => togglePick(i.id)}
                    selected={picked.has(i.id)}
                    checkable
                    size="sm"
                    meta={sort === "recent" ? "sub" : "wear"}
                  />
                ) : (
                  <ItemCard key={i.id} item={i} href={`/wardrobe/${i.id}`} size="sm" meta={sort === "recent" ? "sub" : "wear"} />
                ),
              )}
              {!picked && <Link
                href={cat !== "all" ? `/add?category=${cat}` : "/add"}
                className="flex aspect-[5/6] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-2 text-mute transition hover:border-ink hover:text-ink"
              >
                <IconPlus />
                <span className="text-[11.5px]">추가</span>
              </Link>}
            </div>
          )}
        </>
      )}

      {picked && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-8">
          <button
            className="btn btn-dark w-full max-w-sm shadow-lg disabled:opacity-40"
            style={{ background: "var(--color-danger)" }}
            disabled={picked.size === 0}
            onClick={() => setConfirmDel(true)}
          >
            <IconTrash width={16} height={16} /> {picked.size}개 삭제
          </button>
        </div>
      )}

      <Sheet open={confirmDel} onClose={() => !deleting && setConfirmDel(false)} title={`옷 ${picked?.size ?? 0}벌을 삭제할까요?`}>
        <p className="text-[14px] leading-relaxed text-ink-2">
          착용 기록에서도 빠지고, 이 옷들만으로 구성된 저장 코디는 함께 삭제돼요. 되돌릴 수 없어요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn btn-line" disabled={deleting} onClick={() => setConfirmDel(false)}>
            취소
          </button>
          <button
            className="btn btn-dark"
            style={{ background: "var(--color-danger)" }}
            disabled={deleting}
            onClick={async () => {
              if (!picked) return;
              setDeleting(true);
              try {
                await deleteItems([...picked]);
                toast(`${picked.size}벌을 삭제했어요`);
                setPicked(null);
              } catch {
                toast("일부 옷을 삭제하지 못했어요");
              } finally {
                setDeleting(false);
                setConfirmDel(false);
              }
            }}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </Sheet>

      <Sheet
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={{ all: "필터", color: "색상", season: "계절", style: "스타일", brand: "브랜드" }[panel ?? "all"]}
      >
        <div className="divide-y divide-line">
          {(panel === "all" || panel === "color") && (
            <Field label="색상">
              <ColorPicker options={presentColors} value={f.colors} onChange={(v) => setF((x) => ({ ...x, colors: (v as string[]) ?? [] }))} multiple />
            </Field>
          )}
          {(panel === "all" || panel === "season") && (
            <Field label="계절">
              <ChipGroup options={SEASONS} value={f.seasons} onChange={(v) => setF((x) => ({ ...x, seasons: (v as Season[]) ?? [] }))} multiple />
            </Field>
          )}
          {(panel === "all" || panel === "style") && (
            <Field label="스타일">
              <ChipGroup options={STYLES} value={f.styles} onChange={(v) => setF((x) => ({ ...x, styles: (v as string[]) ?? [] }))} multiple />
            </Field>
          )}
          {(panel === "all" || panel === "brand") && brands.length > 0 && (
            <Field label="브랜드">
              <ChipGroup options={brands.map((b) => ({ key: b, ko: b }))} value={f.brands} onChange={(v) => setF((x) => ({ ...x, brands: (v as string[]) ?? [] }))} multiple />
            </Field>
          )}
          {panel === "all" && (
            <Field label="정렬 · 착용 빈도">
              <ChipGroup options={SORTS} value={sort} onChange={(v) => v && setSort(v as Sort)} />
            </Field>
          )}
        </div>
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
          <button className="btn btn-line" onClick={() => setF(NO_FILTERS)}>
            초기화
          </button>
          <button className="btn btn-dark" onClick={() => setPanel(null)}>
            {list.length}개 보기
          </button>
        </div>
      </Sheet>
    </div>
  );
}
