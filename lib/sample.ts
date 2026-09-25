import type { NewWardrobeItem } from "./types";

type S = NewWardrobeItem & { key: string };

const base = { secondary_color: null, material: null, hem_length: null, gender: "unisex", brand: null, notes: null, ai_raw: null, placement: null };

/** Demo wardrobe — rendered with GarmentGlyph (no photos needed). */
export const SAMPLE_ITEMS: S[] = [
  { key: "bk-tee", name: "블랙 오버핏 반팔 티셔츠", category: "top", subcategory: "반팔 티셔츠", color: "black", pattern: "solid", fit: "oversized", style: ["casual", "street", "minimal"], season: ["spring", "summer", "fall"], formality: 1, ...base },
  { key: "wh-tee", name: "화이트 반팔 티셔츠", category: "top", subcategory: "반팔 티셔츠", color: "white", pattern: "solid", fit: "regular", style: ["casual", "minimal"], season: ["spring", "summer", "fall"], formality: 1, ...base },
  { key: "wh-shirt", name: "화이트 옥스포드 셔츠", category: "top", subcategory: "셔츠", color: "white", pattern: "solid", fit: "regular", style: ["classic", "minimal", "cityboy"], season: ["spring", "fall", "winter"], formality: 3, ...base, material: "cotton" },
  { key: "sb-shirt", name: "스카이블루 스트라이프 셔츠", category: "top", subcategory: "셔츠", color: "skyblue", pattern: "stripe", fit: "oversized", style: ["cityboy", "casual"], season: ["spring", "summer", "fall"], formality: 2, ...base },
  { key: "gr-knit", name: "그레이 크루넥 니트", category: "top", subcategory: "니트", color: "gray", pattern: "solid", fit: "regular", style: ["minimal", "classic"], season: ["fall", "winter"], formality: 3, ...base, material: "wool" },
  { key: "nv-sweat", name: "네이비 스웨트셔츠", category: "top", subcategory: "스웨트셔츠", color: "navy", pattern: "solid", fit: "relaxed", style: ["casual", "amekaji"], season: ["spring", "fall", "winter"], formality: 1, ...base },
  { key: "gn-hood", name: "올리브 후드", category: "top", subcategory: "후드", color: "olive", pattern: "solid", fit: "oversized", style: ["street", "gorpcore"], season: ["fall", "winter"], formality: 1, ...base },

  { key: "lb-denim", name: "연청 와이드 데님", category: "bottom", subcategory: "데님", color: "lightblue", pattern: "solid", fit: "wide", style: ["casual", "street", "cityboy"], season: ["spring", "summer", "fall", "winter"], formality: 1, ...base, material: "denim" },
  { key: "raw-denim", name: "생지 스트레이트 데님", category: "bottom", subcategory: "데님", color: "denim", pattern: "solid", fit: "straight", style: ["amekaji", "casual", "classic"], season: ["spring", "fall", "winter"], formality: 2, ...base, material: "denim" },
  { key: "bg-chino", name: "베이지 치노 팬츠", category: "bottom", subcategory: "치노 팬츠", color: "beige", pattern: "solid", fit: "regular", style: ["classic", "cityboy", "minimal"], season: ["spring", "summer", "fall"], formality: 3, ...base, material: "cotton" },
  { key: "gy-slacks", name: "그레이 와이드 슬랙스", category: "bottom", subcategory: "슬랙스", color: "gray", pattern: "solid", fit: "wide", style: ["minimal", "classic"], season: ["spring", "fall", "winter"], formality: 4, ...base },
  { key: "bk-cargo", name: "블랙 카고 팬츠", category: "bottom", subcategory: "카고 팬츠", color: "black", pattern: "solid", fit: "relaxed", style: ["street", "gorpcore"], season: ["spring", "fall", "winter"], formality: 1, ...base },

  { key: "nv-blouson", name: "네이비 블루종", category: "outer", subcategory: "블루종", color: "navy", pattern: "solid", fit: "regular", style: ["classic", "cityboy", "minimal"], season: ["spring", "fall"], formality: 3, ...base },
  { key: "kh-jacket", name: "카키 워크 자켓", category: "outer", subcategory: "자켓", color: "khaki", pattern: "solid", fit: "relaxed", style: ["amekaji", "gorpcore"], season: ["spring", "fall"], formality: 2, ...base },
  { key: "ch-coat", name: "차콜 싱글 코트", category: "outer", subcategory: "코트", color: "charcoal", pattern: "solid", fit: "regular", style: ["classic", "minimal"], season: ["fall", "winter"], formality: 4, ...base, material: "wool" },
  { key: "iv-cardigan", name: "아이보리 가디건", category: "outer", subcategory: "가디건", color: "ivory", pattern: "solid", fit: "relaxed", style: ["minimal", "cityboy"], season: ["spring", "fall"], formality: 2, ...base },

  { key: "wh-sneak", name: "화이트 스니커즈", category: "shoes", subcategory: "스니커즈", color: "white", pattern: "solid", fit: null, style: ["casual", "minimal", "street"], season: ["spring", "summer", "fall", "winter"], formality: 2, ...base },
  { key: "bk-loafer", name: "블랙 페니 로퍼", category: "shoes", subcategory: "로퍼", color: "black", pattern: "solid", fit: null, style: ["classic", "minimal", "cityboy"], season: ["spring", "fall", "winter"], formality: 4, ...base, material: "leather" },
  { key: "gy-runner", name: "그레이 러닝화", category: "shoes", subcategory: "러닝화", color: "gray", pattern: "solid", fit: null, style: ["sporty", "gorpcore"], season: ["spring", "summer", "fall"], formality: 1, ...base },
  { key: "br-boots", name: "브라운 스웨이드 부츠", category: "shoes", subcategory: "부츠", color: "brown", pattern: "solid", fit: null, style: ["amekaji", "classic"], season: ["fall", "winter"], formality: 3, ...base },

  { key: "bk-cap", name: "블랙 볼캡", category: "acc", subcategory: "모자", color: "black", pattern: "solid", fit: null, style: ["casual", "street"], season: ["spring", "summer", "fall", "winter"], formality: 1, ...base },
  { key: "bg-tote", name: "베이지 캔버스 토트", category: "acc", subcategory: "가방", color: "beige", pattern: "solid", fit: null, style: ["minimal", "cityboy"], season: ["spring", "summer", "fall"], formality: 2, ...base },
];

/** Past wear history so utilization features have something to show. */
export const SAMPLE_WEARS: { daysAgo: number; keys: string[] }[] = [
  ...Array.from({ length: 10 }, (_, k) => ({ daysAgo: 3 + k * 3, keys: ["bk-tee", "lb-denim", "wh-sneak"] })),
  ...Array.from({ length: 8 }, (_, k) => ({ daysAgo: 4 + k * 3, keys: ["wh-tee", "lb-denim", "wh-sneak", "bk-cap"] })),
  ...Array.from({ length: 4 }, (_, k) => ({ daysAgo: 5 + k * 4, keys: ["nv-sweat", "bk-cargo", "gy-runner"] })),
  { daysAgo: 37, keys: ["bg-chino", "wh-tee", "wh-sneak"] },
  { daysAgo: 60, keys: ["bg-chino", "wh-shirt", "bk-loafer"] },
  { daysAgo: 45, keys: ["gy-slacks", "wh-shirt", "bk-loafer", "nv-blouson"] },
];
