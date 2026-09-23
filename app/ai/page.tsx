"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IconBack, IconPlus, IconShuffle, IconSliders } from "@/components/icons";
import { ItemVisual } from "@/components/ItemVisual";
import { OutfitBoard } from "@/components/OutfitBoard";
import { ChipGroup, Empty, Field, Loading } from "@/components/ui";
import { useStore } from "@/lib/store";
import { generateOutfit, outfitTags, signature, toneKo, type Selection } from "@/lib/styling";
import { currentSeason, SEASONS, STYLES } from "@/lib/taxonomy";
import type { Season, Slot, WardrobeItem } from "@/lib/types";

const SITUATIONS = [
  { key: "daily", ko: "일상", formality: 1.6 },
  { key: "school", ko: "학교", formality: 2 },
  { key: "work", ko: "출근", formality: 3 },
  { key: "date", ko: "데이트", formality: 2.8 },
  { key: "travel", ko: "여행", formality: 1.8 },
  { key: "friends", ko: "친구 만남", formality: 2 },
  { key: "party", ko: "파티", formality: 3 },
  { key: "formal", ko: "격식", formality: 4.5 },
  { key: "workout", ko: "운동", formality: 1 },
];
const MOODS = [{ key: "all", ko: "전체" }, ...STYLES.filter((s) => s.key !== "formal")];
const TITLE: Record<string, [string, string]> = {
  casual: ["데일리 캐주얼", "편하게 손이 가지만 정돈돼 보이는 조합이에요."],
  minimal: ["꾸안꾸 미니멀", "색과 디테일을 덜어내 깔끔하게 맞췄어요."],
  street: ["스트릿 무드", "여유 있는 실루엣으로 힘을 뺀 스트릿 룩이에요."],
  cityboy: ["시티보이 레이어드", "넉넉한 핏과 레이어링으로 도시적인 느낌을 냈어요."],
  classic: ["클래식 스마트", "단정한 아이템 위주로 격식을 살짝 올렸어요."],
  amekaji: ["아메카지 워크", "워크웨어 톤의 소재와 색으로 맞췄어요."],
  gorpcore: ["고프코어 아웃도어", "기능성 아이템으로 활동적인 무드를 냈어요."],
  sporty: ["스포티 액티브", "움직이기 편한 아이템 중심이에요."],
};

type Look = { sel: Selection; reasons: string[]; style: string };
const ORDER: Slot[] = ["outer", "top", "bottom", "shoes", "acc"];
const toQuery = (sel: Selection) => (Object.entries(sel) as [Slot, WardrobeItem][]).map(([s, i]) => `${s}=${i.id}`).join("&");

/**
 * Phase 1: rule engine picks 3 looks from the user's own wardrobe (no API cost).
 * Phase 2: the same UI calls /api/stylist (Claude, wardrobe sent as text JSON) — Look[] shape unchanged.
 */
export default function StylistPage() {
  const router = useRouter();
  const { ready, items, prefs } = useStore();
  const [mood, setMood] = useState("all");
  const [situation, setSituation] = useState("daily");
  const [season, setSeason] = useState<Season>(currentSeason());
  const [wakeUp, setWakeUp] = useState(true);
  const [showCond, setShowCond] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Wardrobe's own dominant styles — "전체" spreads the 3 looks across them.
  const topStyles = useMemo(() => {
    const f = new Map<string, number>();
    for (const i of items) for (const s of i.style) f.set(s, (f.get(s) ?? 0) + 1);
    return [...f.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).filter((s) => TITLE[s]);
  }, [items]);

  const looks = useMemo<Look[]>(() => {
    void nonce;
    if (items.length < 3) return [];
    const sit = SITUATIONS.find((s) => s.key === situation)!;
    const out: Look[] = [];
    const seen = new Set<string>();
    const biases = mood === "all" ? [...topStyles.slice(0, 3), "casual", "minimal", "street"] : [mood, mood, mood, mood, mood];
    for (let k = 0; k < 12 && out.length < 3; k++) {
      const style = biases[out.length] ?? "casual";
      const g = generateOutfit(items, {
        season,
        prefs,
        targetFormality: sit.formality,
        styleBias: situation === "workout" ? ["sporty", style] : [style],
        favorDormant: wakeUp,
        exclude: seen,
        samples: 160,
      });
      if (!g) break;
      const { _reasons, ...sel } = g;
      const sig = signature(sel);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ sel, reasons: _reasons ?? [], style });
    }
    return out;
  }, [items, prefs, mood, situation, season, wakeUp, topStyles, nonce]);

  useEffect(() => window.scrollTo({ top: 0 }), []);

  if (!ready) return <Loading />;

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="-mx-4 flex h-11 items-center gap-2 px-4 lg:mx-0 lg:px-0">
        <button onClick={() => router.back()} className="-ml-1.5 p-1.5 lg:hidden" aria-label="뒤로">
          <IconBack width={20} height={20} />
        </button>
        <h1 className="text-[15px] font-bold lg:text-[18px]">AI 스타일리스트</h1>
      </div>

      {items.length < 3 ? (
        <Empty
          title="옷이 조금 더 필요해요"
          body="상의·하의·신발을 등록하면 내 옷장 안에서 코디를 골라드려요."
          action={
            <Link href="/add" className="btn btn-dark">
              <IconPlus width={16} height={16} /> 옷 추가
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <h2 className="text-[20px] font-bold">오늘의 추천 코디</h2>
              <p className="mt-0.5 text-[12.5px] text-mute">
                {SEASONS.find((s) => s.key === season)?.ko} · {SITUATIONS.find((s) => s.key === situation)?.ko} · 내 옷장에 있는 옷으로만 골랐어요
              </p>
            </div>
            <div className="flex gap-1">
              <button aria-label="다시 추천" onClick={() => setNonce((n) => n + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-line">
                <IconShuffle width={17} height={17} />
              </button>
              <button
                aria-label="조건"
                onClick={() => setShowCond((x) => !x)}
                className={`grid h-9 w-9 place-items-center rounded-md border ${showCond ? "border-ink bg-ink text-paper" : "border-line"}`}
              >
                <IconSliders width={17} height={17} />
              </button>
            </div>
          </div>

          <div className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {MOODS.map((m) => (
              <button key={m.key} className="chip shrink-0" data-on={mood === m.key} onClick={() => setMood(m.key)}>
                {m.key === "all" ? "일상" : m.ko}
              </button>
            ))}
          </div>

          {showCond && (
            <div className="mt-3 divide-y divide-line rounded-lg border border-line px-4">
              <Field label="상황">
                <ChipGroup options={SITUATIONS} value={situation} onChange={(v) => v && setSituation(v as string)} />
              </Field>
              <Field label="계절">
                <ChipGroup options={SEASONS} value={season} onChange={(v) => v && setSeason(v as Season)} />
              </Field>
              <Field label="잘 안 입는 옷 활용">
                <button className="chip" data-on={wakeUp} onClick={() => setWakeUp((x) => !x)}>
                  {wakeUp ? "켜짐 · 잠든 옷을 우선 섞어요" : "꺼짐"}
                </button>
              </Field>
            </div>
          )}

          {looks.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-mute">조건에 맞는 조합을 찾지 못했어요. 계절이나 상황을 바꿔보세요.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {looks.map((l, k) => {
                const [title, desc] = TITLE[l.style] ?? TITLE.casual;
                const tags = outfitTags(l.sel);
                const hashtags = [
                  ...new Set([
                    STYLES.find((s) => s.key === l.style)?.ko,
                    ...tags.styles.map((s) => STYLES.find((x) => x.key === s.toLowerCase())?.ko),
                    toneKo(tags.tone),
                  ]),
                ].filter(Boolean);
                return (
                  <Link
                    key={signature(l.sel)}
                    href={`/outfit?${toQuery(l.sel)}`}
                    className="rise flex gap-4 rounded-lg border border-line p-3 transition hover:border-ink"
                    style={{ animationDelay: `${k * 60}ms` }}
                  >
                    <div className="w-[38%] max-w-[170px] shrink-0">
                      <OutfitBoard sel={l.sel} aspect="aspect-[3/4]" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col py-1">
                      <p className="text-[15px] font-bold">{title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{l.reasons[0] ? `${l.reasons[0]}. ${desc}` : desc}</p>
                      <div className="mt-3 flex gap-1.5">
                        {ORDER.map((s) => l.sel[s])
                          .filter(Boolean)
                          .map((i) => (
                            <span key={i!.id} className="block h-[52px] w-[46px] shrink-0 rounded bg-card p-1 lg:h-[64px] lg:w-[56px]">
                              <ItemVisual item={i!} />
                            </span>
                          ))}
                      </div>
                      <p className="mt-auto flex flex-wrap gap-x-2 pt-3 text-[11.5px] font-semibold text-ink-2">
                        {hashtags.map((h) => (
                          <span key={h}>#{h}</span>
                        ))}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-mute">
            지금은 색 조화·계절·격식·실루엣·착용 이력을 계산해 추천해요. 자연어 요청과 날씨를 반영하는 Claude 스타일리스트는 다음 단계에서 연결됩니다.
          </p>
        </>
      )}
    </div>
  );
}
