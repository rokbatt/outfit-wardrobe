/**
 * Rule-based outfit logic. Zero AI calls — runs instantly on-device.
 * Used by: Random outfit, Today's outfit, Dormant-item suggestions.
 */
import { colorDef, currentSeason, SLOTS } from "./taxonomy";
import type { Preferences, Season, Slot, WardrobeItem } from "./types";

export type Selection = Partial<Record<Slot, WardrobeItem>>;

export const DORMANT_DAYS = 21;

export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

export function bySlot(items: WardrobeItem[]): Record<Slot, WardrobeItem[]> {
  const out = { outer: [], top: [], bottom: [], shoes: [], acc: [] } as Record<Slot, WardrobeItem[]>;
  for (const it of items) {
    const s = SLOTS.find((x) => x.category === it.category)?.key;
    if (s) out[s].push(it);
  }
  return out;
}

/** Items that have been sleeping: never worn (and older than a week) or not worn for DORMANT_DAYS. */
export function dormantItems(items: WardrobeItem[], now = new Date()): WardrobeItem[] {
  return items
    .filter((i) => i.category !== "etc")
    .map((i) => {
      const since = daysSince(i.last_worn_at, now);
      const age = daysSince(i.created_at, now) ?? 0;
      const sleep = since ?? age; // never worn → sleeping since registered
      return { i, sleep, never: since === null };
    })
    .filter(({ sleep, never }) => (never ? sleep >= 7 : sleep >= DORMANT_DAYS))
    .sort((a, b) => b.sleep - a.sleep || a.i.wear_count - b.i.wear_count)
    .map(({ i }) => i);
}

interface ScoreCtx {
  season: Season;
  prefs?: Preferences;
  favorItemId?: string;
  favorDormant?: boolean;
  now?: Date;
  targetFormality?: number;
  styleBias?: string[];
}

export interface Scored {
  score: number;
  reasons: string[];
}

export function scoreOutfit(sel: Selection, ctx: ScoreCtx): Scored {
  const list = Object.values(sel).filter(Boolean) as WardrobeItem[];
  const reasons: string[] = [];
  let s = 0;
  if (list.length === 0) return { score: -99, reasons };

  // 1. Color harmony — neutral base + at most one accent.
  const chroma = new Set(list.map((i) => i.color).filter((c) => !colorDef(c).neutral));
  if (chroma.size === 0) {
    s += 1;
    reasons.push("뉴트럴 톤으로 정돈된 조합");
  } else if (chroma.size === 1) {
    s += 1.5;
    reasons.push(`${colorDef([...chroma][0]).ko} 한 가지로 포인트`);
  } else if (chroma.size === 2) s -= 0.6;
  else s -= 2;
  const colors = new Set(list.map((i) => i.color));
  if (colors.has("black") && colors.has("navy")) s -= 0.3;
  if (colors.has("brown") && colors.has("black") && list.length <= 3) s -= 0.2;
  const tonal = list.filter((i) => ["beige", "ivory", "brown", "khaki"].includes(i.color)).length;
  if (tonal >= 2 && chroma.size === 0) {
    s += 0.4;
    reasons.push("베이지 계열 톤온톤");
  }

  // 2. Pattern — one busy piece max.
  const busy = list.filter((i) => i.pattern && i.pattern !== "solid").length;
  if (busy > 1) s -= 1;

  // 3. Season fit.
  const off = list.filter((i) => i.season.length > 0 && !i.season.includes(ctx.season));
  s -= off.length * 1.2;
  if (off.length === 0 && list.length >= 3) s += 0.3;

  // 4. Formality consistency.
  const f = list.map((i) => i.formality);
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  const sd = Math.sqrt(f.reduce((a, b) => a + (b - mean) ** 2, 0) / f.length);
  s -= sd * 1.1;
  if (ctx.targetFormality) s -= Math.abs(mean - ctx.targetFormality) * 0.9;
  if (ctx.styleBias?.length) {
    const hit = list.filter((i) => i.style.some((x) => ctx.styleBias!.includes(x))).length;
    s += hit * 0.45;
    if (hit >= 2) reasons.push("원하는 무드에 맞춘 아이템 구성");
  }

  // 5. Shared style language.
  const top = sel.top;
  const bottom = sel.bottom;
  if (top && bottom) {
    const shared = top.style.filter((x) => bottom.style.includes(x));
    if (shared.length) s += 0.5;
    // 6. Silhouette balance.
    const loose = (x?: string | null) => x === "oversized" || x === "wide" || x === "relaxed";
    const tight = (x?: string | null) => x === "slim" || x === "tapered" || x === "regular" || x === "straight";
    if (tight(top.fit) && loose(bottom.fit)) {
      s += 0.4;
      reasons.push("정핏 상의 + 여유 있는 하의 밸런스");
    } else if (loose(top.fit) && tight(bottom.fit)) {
      s += 0.4;
      reasons.push("오버핏 상의 + 슬림한 하의 밸런스");
    } else if (loose(top.fit) && loose(bottom.fit)) s += 0.15;
  }

  // 7. Utilization — wake up sleeping clothes, avoid what was just worn.
  const now = ctx.now ?? new Date();
  for (const i of list) {
    const since = daysSince(i.last_worn_at, now);
    if (since !== null && since <= 2) s -= 0.8;
    if (ctx.favorDormant && (since === null || since >= DORMANT_DAYS)) s += 0.45;
    if (i.id === ctx.favorItemId) s += 5;
  }

  // 8. Preferences.
  if (ctx.prefs) {
    for (const i of list) {
      if (ctx.prefs.avoid_colors.includes(i.color)) s -= 1.5;
      if (ctx.prefs.favorite_colors.includes(i.color)) s += 0.2;
      if (i.style.some((x) => ctx.prefs!.preferred_styles.includes(x))) s += 0.15;
    }
  }

  return { score: s, reasons };
}

function pick<T>(xs: T[]): T | undefined {
  return xs[Math.floor(Math.random() * xs.length)];
}

export interface GenerateOpts {
  season?: Season;
  prefs?: Preferences;
  locked?: Partial<Record<Slot, WardrobeItem | null>>; // null = explicitly empty
  favorItemId?: string;
  favorDormant?: boolean;
  samples?: number;
  deterministic?: boolean; // take the best instead of weighted-random among top
  exclude?: Set<string>; // outfit signatures to avoid (e.g. already saved)
  targetFormality?: number;
  styleBias?: string[];
}

export const signature = (sel: Selection) =>
  (Object.values(sel).filter(Boolean) as WardrobeItem[]).map((i) => i.id).sort().join("|");

/**
 * Sample candidate combinations and choose among the best — random but sensible.
 * Outerwear is included by season; accessories occasionally.
 */
export function generateOutfit(items: WardrobeItem[], opts: GenerateOpts = {}): (Selection & { _reasons?: string[] }) | null {
  const season = opts.season ?? currentSeason();
  const groups = bySlot(items.filter((i) => i.season.length === 0 || i.season.includes(season) || i.id === opts.favorItemId));
  const all = bySlot(items);
  // Fall back to all items for a slot if the season filter empties it.
  for (const s of Object.keys(groups) as Slot[]) if (groups[s].length === 0) groups[s] = all[s];

  const favor = opts.favorItemId ? items.find((i) => i.id === opts.favorItemId) : undefined;
  const favorSlot = favor ? SLOTS.find((x) => x.category === favor.category)?.key : undefined;

  if (!groups.top.length && !groups.bottom.length) return null;

  const wantOuter = season === "winter" ? 1 : season === "fall" || season === "spring" ? 0.6 : 0.05;
  const n = opts.samples ?? 80;
  const cands: { sel: Selection; sc: Scored }[] = [];
  for (let k = 0; k < n; k++) {
    const sel: Selection = {};
    for (const s of ["top", "bottom", "shoes", "outer", "acc"] as Slot[]) {
      if (opts.locked && s in opts.locked) {
        const v = opts.locked[s];
        if (v) sel[s] = v;
        continue;
      }
      if (s === favorSlot && favor) {
        sel[s] = favor;
        continue;
      }
      if (s === "outer" && (Math.random() > wantOuter || !groups.outer.length)) continue;
      if (s === "acc" && Math.random() > 0.3) continue;
      const v = pick(groups[s]);
      if (v) sel[s] = v;
    }
    if (opts.exclude?.has(signature(sel))) continue;
    cands.push({ sel, sc: scoreOutfit(sel, {
        season,
        prefs: opts.prefs,
        favorItemId: opts.favorItemId,
        favorDormant: opts.favorDormant,
        targetFormality: opts.targetFormality,
        styleBias: opts.styleBias,
      }),
    });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.sc.score - a.sc.score);
  const chosen = opts.deterministic ? cands[0] : cands[Math.floor(Math.random() * Math.min(5, cands.length))];
  return { ...chosen.sel, _reasons: chosen.sc.reasons };
}

/** Seeded daily outfit so "Today's outfit" is stable within a day. */
export function todaysOutfit(items: WardrobeItem[], prefs: Preferences, dateKey: string) {
  let seed = [...dateKey].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + items.length;
  const orig = Math.random;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  try {
    return generateOutfit(items, { prefs, favorDormant: true, deterministic: true, samples: 120 });
  } finally {
    Math.random = orig;
  }
}

/** How many distinct top×bottom×shoes combinations exist (the headline metric). */
export function combinationCount(items: WardrobeItem[]): number {
  const g = bySlot(items);
  const t = g.top.length;
  const b = g.bottom.length;
  const sh = Math.max(1, g.shoes.length);
  const o = g.outer.length + 1; // with or without outer
  return t && b ? t * b * sh * o : 0;
}

/** Completely random pick per unlocked slot (the "PURE RANDOM" option). */
export function pureRandom(items: WardrobeItem[], locked: Partial<Record<Slot, WardrobeItem | null>> = {}): Selection {
  const g = bySlot(items);
  const sel: Selection = {};
  for (const s of ["top", "bottom", "shoes", "outer", "acc"] as Slot[]) {
    if (s in locked) {
      const v = locked[s];
      if (v) sel[s] = v;
      continue;
    }
    if ((s === "outer" || s === "acc") && Math.random() < 0.4) continue;
    const v = pick(g[s]);
    if (v) sel[s] = v;
  }
  return sel;
}

/** Hard compatibility used for the "possible outfits" count (cheap, no season of the day). */
function compatible(list: WardrobeItem[]) {
  const chroma = new Set(list.map((i) => i.color).filter((c) => !colorDef(c).neutral));
  if (chroma.size > 2) return false;
  if (list.filter((i) => i.pattern && i.pattern !== "solid").length > 1) return false;
  const f = list.map((i) => i.formality);
  if (Math.max(...f) - Math.min(...f) > 2) return false;
  const seasoned = list.filter((i) => i.season.length);
  if (seasoned.length > 1) {
    const common = seasoned.reduce<Season[]>((acc, i) => acc.filter((s) => i.season.includes(s)), [...seasoned[0].season]);
    if (!common.length) return false;
  }
  return true;
}

/**
 * top × bottom × shoes × (outer | none) — `total` is the raw product,
 * `good` excludes combinations that clash (season, formality gap, >2 accent colours, 2 busy patterns).
 */
export function combinationStats(items: WardrobeItem[]): { total: number; good: number; estimated: boolean } {
  const g = bySlot(items);
  const shoes = g.shoes.length ? g.shoes : [undefined];
  const outers = [undefined, ...g.outer];
  const total = g.top.length * g.bottom.length * shoes.length * outers.length;
  if (!g.top.length || !g.bottom.length) return { total: 0, good: 0, estimated: false };
  const LIMIT = 40_000;
  if (total <= LIMIT) {
    let good = 0;
    for (const t of g.top)
      for (const b of g.bottom) {
        if (!compatible([t, b])) continue;
        for (const s of shoes)
          for (const o of outers) if (compatible([t, b, s, o].filter(Boolean) as WardrobeItem[])) good++;
      }
    return { total, good, estimated: false };
  }
  // Large wardrobes: Monte-Carlo estimate.
  let hit = 0;
  const N = 6000;
  for (let k = 0; k < N; k++) {
    const l = [pick(g.top), pick(g.bottom), pick(shoes), pick(outers)].filter(Boolean) as WardrobeItem[];
    if (compatible(l)) hit++;
  }
  return { total, good: Math.round((hit / N) * total), estimated: true };
}

const STYLE_EN: Record<string, string> = {
  casual: "CASUAL", minimal: "MINIMAL", street: "STREET", cityboy: "CITYBOY", classic: "CLASSIC",
  amekaji: "AMEKAJI", gorpcore: "GORPCORE", sporty: "SPORTY", formal: "FORMAL",
};

/** Short tags for the current look: shared styles + tone. */
export function outfitTags(sel: Selection): { styles: string[]; tone: string | null } {
  const list = Object.values(sel).filter(Boolean) as WardrobeItem[];
  if (!list.length) return { styles: [], tone: null };
  const freq = new Map<string, number>();
  for (const i of list) for (const s of i.style) freq.set(s, (freq.get(s) ?? 0) + 1);
  const styles = [...freq.entries()]
    .filter(([, n]) => n >= Math.min(2, list.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([s]) => STYLE_EN[s] ?? s.toUpperCase());
  const chroma = [...new Set(list.map((i) => i.color).filter((c) => !colorDef(c).neutral))];
  const tonal = list.filter((i) => ["beige", "ivory", "brown", "khaki"].includes(i.color)).length;
  const dark = list.filter((i) => ["black", "charcoal", "navy"].includes(i.color)).length;
  const tone =
    chroma.length === 1
      ? `${chroma[0].toUpperCase()} POINT`
      : chroma.length > 1
        ? "COLORFUL"
        : tonal >= 2
          ? "TONE ON TONE"
          : dark >= Math.ceil(list.length * 0.75)
            ? "DARK TONE"
            : "NEUTRAL TONE";
  return { styles, tone };
}

/** Korean hashtag for a tone tag. */
export function toneKo(tone: string | null | undefined): string | null {
  if (!tone) return null;
  if (tone === "NEUTRAL TONE") return "뉴트럴톤";
  if (tone === "TONE ON TONE") return "톤온톤";
  if (tone === "DARK TONE") return "다크톤";
  if (tone === "COLORFUL") return "컬러풀";
  if (tone.endsWith(" POINT")) return "컬러포인트";
  return tone;
}
