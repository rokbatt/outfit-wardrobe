"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconChevronR, IconJacket, IconPants, IconPlus, IconSearch, IconShoe, IconShuffle, IconTee, IconUser } from "@/components/icons";
import { ItemCard, ItemVisual } from "@/components/ItemVisual";
import { OutfitBoard, selFromRefs } from "@/components/OutfitBoard";
import { Loading } from "@/components/ui";
import { todayISO, useStore } from "@/lib/store";
import { daysSince, dormantItems, generateOutfit, outfitTags, todaysOutfit, type Selection } from "@/lib/styling";
import { SLOTS } from "@/lib/taxonomy";
import type { Slot, WardrobeItem } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const toQuery = (sel: Selection) => (Object.entries(sel) as [Slot, WardrobeItem][]).map(([s, i]) => `${s}=${i.id}`).join("&");
const ORDER: Slot[] = ["outer", "top", "bottom", "shoes", "acc"];
const pieces = (sel: Selection) => ORDER.map((s) => sel[s]).filter(Boolean) as WardrobeItem[];
const slotOf = (i: WardrobeItem | undefined): Slot | undefined => (i ? SLOTS.find((s) => s.category === i.category)?.key : undefined);

const TILES = [
  { key: "top", ko: "상의", Icon: IconTee },
  { key: "bottom", ko: "하의", Icon: IconPants },
  { key: "outer", ko: "아우터", Icon: IconJacket },
  { key: "shoes", ko: "신발", Icon: IconShoe },
];

export default function Home() {
  const { ready, items, outfits, logs, prefs, itemById, wear, seedSample } = useStore();
  const [shuffle, setShuffle] = useState(0);
  const [dShuffle, setDShuffle] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const today = todayISO();
  const wornToday = logs.find((l) => l.worn_at === today);

  const todays = useMemo<Selection | null>(() => {
    if (!items.length) return null;
    const g = shuffle === 0 ? todaysOutfit(items, prefs, today) : generateOutfit(items, { prefs, favorDormant: true });
    if (!g) return null;
    const { _reasons, ...sel } = g;
    void _reasons;
    return sel;
  }, [items, prefs, today, shuffle]);

  const wornSel = useMemo<Selection | null>(() => {
    if (!wornToday) return null;
    const refs = wornToday.item_ids
      .map((id) => ({ wardrobe_item_id: id, slot: slotOf(itemById.get(id)) }))
      .filter((r): r is { wardrobe_item_id: string; slot: Slot } => !!r.slot);
    return selFromRefs(refs, itemById);
  }, [wornToday, itemById]);

  const dormant = useMemo(() => dormantItems(items), [items]);
  const spotlight = dormant.length ? dormant[dShuffle % Math.min(dormant.length, 5)] : undefined;
  const dormantLook = useMemo(() => {
    if (!spotlight) return null;
    const g = generateOutfit(items, { favorItemId: spotlight.id, prefs, deterministic: dShuffle === 0 });
    if (!g) return null;
    const { _reasons, ...sel } = g;
    void _reasons;
    return Object.keys(sel).length > 1 ? sel : null;
  }, [spotlight, items, prefs, dShuffle]);

  const monthKey = today.slice(0, 7);
  const wornThisMonth = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) if (l.worn_at.startsWith(monthKey)) l.item_ids.forEach((i) => s.add(i));
    return s.size;
  }, [logs, monthKey]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) m[i.category] = (m[i.category] ?? 0) + 1;
    return m;
  }, [items]);

  if (!ready) return <Loading />;
  const name = prefs.display_name?.trim();
  const shown = wornSel ?? todays;
  const tags = shown ? outfitTags(shown) : null;

  return (
    <div>
      {/* mobile top bar */}
      <div className="-mx-4 mb-3 flex h-11 items-center justify-between px-4 lg:hidden">
        <span className="brand text-[18px]">OUTFIT</span>
        <div className="flex items-center gap-1">
          <Link href="/wardrobe?search=1" aria-label="검색" className="p-2">
            <IconSearch width={21} height={21} />
          </Link>
          <Link href="/profile" aria-label="프로필" className="-mr-2 p-2">
            <IconUser width={21} height={21} />
          </Link>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
        {/* ── left column ── */}
        <div>
          <section className="rise">
            <h1 className="display text-[22px] lg:text-[28px]">
              {greeting()}
              {name ? `, ${name}` : ","}
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-2">오늘은 어떤 스타일을 입어볼까요?</p>
            <Link href="/add" className="btn btn-dark btn-pill mt-4 h-10 px-5 text-[13px]">
              <IconPlus width={16} height={16} strokeWidth={2} /> 옷 추가하기
            </Link>
          </section>

          {items.length === 0 ? (
            <section className="mt-8 rounded-lg border border-line p-5">
              <p className="text-[15px] font-bold">옷장을 디지털로 옮겨볼까요</p>
              <ol className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                <li>1. 자주 입는 옷부터 5벌 찍기 — 배경은 자동으로 지워져요</li>
                <li>2. 자동으로 채워진 정보 확인 후 저장</li>
                <li>3. 코디하기에서 마네킹에 입혀보기</li>
              </ol>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/add" className="btn btn-dark btn-sm">
                  첫 옷 추가하기
                </Link>
                <button
                  disabled={seeding}
                  className="text-[12.5px] text-mute underline underline-offset-4"
                  onClick={async () => {
                    setSeeding(true);
                    await seedSample();
                    setSeeding(false);
                  }}
                >
                  {seeding ? "불러오는 중…" : "샘플 옷장으로 둘러보기"}
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* ── 내 옷장 ── */}
              <section className="mt-7">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <Link href="/wardrobe" className="text-[15px] font-bold">
                    내 옷장
                  </Link>
                  <span className="text-[12px] text-mute">
                    {items.length}개 · 이번 달 {wornThisMonth}벌 착용
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {TILES.map(({ key, ko, Icon }) => (
                    <Link
                      key={key}
                      href={`/wardrobe?c=${key}`}
                      className="flex flex-col items-center rounded-md border border-line py-3 transition hover:border-ink"
                    >
                      <Icon width={26} height={26} strokeWidth={1.3} />
                      <span className="mt-1.5 text-[12px] font-semibold">{ko}</span>
                      <span className="text-[11px] text-mute">{counts[key] ?? 0}</span>
                    </Link>
                  ))}
                </div>
              </section>

              {/* ── AI 추천 row ── */}
              <Link href="/ai" className="mt-3 flex items-center justify-between rounded-md border border-line px-4 py-3.5 transition hover:border-ink">
                <span>
                  <span className="block text-[14px] font-bold">AI 추천 코디</span>
                  <span className="text-[12px] text-mute">상황·분위기에 맞춰 내 옷장에서 3가지를 골라드려요</span>
                </span>
                <IconChevronR width={18} height={18} />
              </Link>

              {/* ── Discover (sleeping clothes) ── */}
              {spotlight && dormantLook && (
                <section className="mt-3 rounded-lg bg-ink p-4 text-paper">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold tracking-[0.06em] text-paper/60">DISCOVER YOUR WARDROBE</p>
                    {dormant.length > 1 && (
                      <button className="tap text-[11.5px] text-paper/70 underline" onClick={() => setDShuffle((s) => s + 1)}>
                        다른 옷
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="h-[92px] w-[76px] shrink-0 rounded-md bg-paper p-1.5">
                      <ItemVisual item={spotlight} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold">{spotlight.name}</p>
                      <p className="mt-0.5 text-[12px] text-paper/60">
                        {spotlight.last_worn_at ? `최근 착용 ${daysSince(spotlight.last_worn_at)}일 전` : "아직 한 번도 안 입었어요"}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-paper/85">
                        {pieces(dormantLook)
                          .filter((i) => i.id !== spotlight.id)
                          .map((i) => i.name)
                          .join(" + ")}
                        와 입어보세요
                      </p>
                    </div>
                  </div>
                  <Link href={`/outfit?${toQuery(dormantLook)}`} className="btn btn-sm mt-3 w-full bg-paper text-ink">
                    이 코디 입어보기
                  </Link>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── right column: today's outfit ── */}
        {shown && (
          <section className="mt-3 rounded-lg border border-line p-4 lg:mt-0 lg:self-start lg:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-extrabold tracking-[0.04em]">{wornSel ? "TODAY · WORN" : "TODAY'S OUTFIT"}</p>
                {tags?.tone && <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold text-ink-2">{tags.tone}</span>}
              </div>
              {!wornSel && (
                <button aria-label="다른 조합" onClick={() => setShuffle((s) => s + 1)} className="tap -mr-1 p-1 text-mute hover:text-ink">
                  <IconShuffle width={17} height={17} />
                </button>
              )}
            </div>
            <div className="mt-3 flex gap-4">
              <Link href={`/outfit?${toQuery(shown)}`} className="w-[44%] shrink-0 lg:w-[48%]">
                <OutfitBoard sel={shown} aspect="aspect-[3/4.2]" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <ul className="space-y-2.5 pt-1">
                  {pieces(shown).map((i) => (
                    <li key={i.id} className="flex items-center gap-2 border-l-2 border-line-2 pl-2.5">
                      <Link href={`/wardrobe/${i.id}`} className="truncate text-[13px] text-ink-2 hover:text-ink">
                        {i.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {tags && tags.styles.length > 0 && <p className="mt-3 text-[10.5px] font-bold tracking-[0.05em] text-mute">{tags.styles.join(" · ")}</p>}
                <div className="mt-auto space-y-1.5 pt-4">
                  {wornSel ? (
                    <Link href="/outfit" className="btn btn-line btn-sm w-full">
                      내일 코디 미리 짜기
                    </Link>
                  ) : (
                    <>
                      <Link href={`/outfit?${toQuery(shown)}`} className="btn btn-dark btn-sm w-full">
                        이 코디 입어보기
                      </Link>
                      <button className="btn btn-line btn-sm w-full" onClick={() => wear(pieces(shown).map((i) => i.id))}>
                        오늘 이렇게 입었어요
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {items.length > 0 && (
        <>
          <section className="mt-8">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">최근 추가한 옷</h2>
              <Link href="/wardrobe" className="tap text-[12px] text-mute">
                전체보기
              </Link>
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-8 lg:px-0">
              {items.slice(0, 16).map((i) => (
                <div key={i.id} className="w-[104px] shrink-0 lg:w-auto">
                  <ItemCard item={i} href={`/wardrobe/${i.id}`} size="sm" />
                </div>
              ))}
            </div>
          </section>

          {outfits.length > 0 && (
            <section className="mt-8">
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="text-[15px] font-bold">내 코디</h2>
                <Link href="/outfits" className="tap text-[12px] text-mute">
                  전체보기
                </Link>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
                {outfits.slice(0, 12).map((o) => (
                  <Link key={o.id} href={`/outfit?outfit=${o.id}`} className="w-[128px] shrink-0 lg:w-auto">
                    <OutfitBoard sel={selFromRefs(o.items, itemById)} render={o.render} photo={o.tryon_url} />
                    <p className="mt-1.5 truncate text-[12px] font-semibold">{o.name}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
