import type { Category, Season, Slot } from "./types";

export const CATEGORIES: { key: Category; ko: string; en: string }[] = [
  { key: "top", ko: "상의", en: "Tops" },
  { key: "bottom", ko: "하의", en: "Bottoms" },
  { key: "outer", ko: "아우터", en: "Outerwear" },
  { key: "shoes", ko: "신발", en: "Shoes" },
  { key: "acc", ko: "액세서리", en: "Accessories" },
  { key: "etc", ko: "기타", en: "Other" },
];
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.ko ?? c;

export const SUBCATEGORIES: Record<Category, string[]> = {
  top: ["반팔 티셔츠", "긴팔 티셔츠", "셔츠", "니트", "스웨트셔츠", "후드", "폴로", "민소매"],
  bottom: ["데님", "슬랙스", "치노 팬츠", "와이드 팬츠", "카고 팬츠", "조거", "쇼츠", "스커트"],
  outer: ["블루종", "자켓", "블레이저", "코트", "패딩", "가디건", "바람막이", "플리스"],
  shoes: ["스니커즈", "러닝화", "로퍼", "더비", "부츠", "샌들", "슬리퍼"],
  acc: ["모자", "가방", "벨트", "시계", "안경", "머플러", "양말"],
  etc: ["원피스", "셋업", "트레이닝", "기타"],
};

/** Slot shown in Outfit Builder, in board order. */
export const SLOTS: { key: Slot; ko: string; en: string; category: Category }[] = [
  { key: "outer", ko: "아우터", en: "Outer", category: "outer" },
  { key: "top", ko: "상의", en: "Top", category: "top" },
  { key: "bottom", ko: "하의", en: "Bottom", category: "bottom" },
  { key: "shoes", ko: "신발", en: "Shoes", category: "shoes" },
  { key: "acc", ko: "액세서리", en: "Acc", category: "acc" },
];
export const slotForCategory = (c: Category): Slot | null =>
  SLOTS.find((s) => s.category === c)?.key ?? null;

export interface ColorDef {
  key: string;
  ko: string;
  hex: string;
  neutral: boolean;
}
export const COLORS: ColorDef[] = [
  { key: "black", ko: "블랙", hex: "#1c1c1c", neutral: true },
  { key: "white", ko: "화이트", hex: "#f7f6f2", neutral: true },
  { key: "ivory", ko: "아이보리", hex: "#ece4d2", neutral: true },
  { key: "gray", ko: "그레이", hex: "#9a9a98", neutral: true },
  { key: "charcoal", ko: "차콜", hex: "#4a4a4c", neutral: true },
  { key: "beige", ko: "베이지", hex: "#d6c3a3", neutral: true },
  { key: "brown", ko: "브라운", hex: "#7a5236", neutral: true },
  { key: "navy", ko: "네이비", hex: "#1f2a44", neutral: true },
  { key: "denim", ko: "데님", hex: "#5a7394", neutral: true },
  { key: "lightblue", ko: "연청", hex: "#a9bfd6", neutral: true },
  { key: "khaki", ko: "카키", hex: "#76704f", neutral: true },
  { key: "olive", ko: "올리브", hex: "#5b5f3a", neutral: false },
  { key: "green", ko: "그린", hex: "#3f7a55", neutral: false },
  { key: "blue", ko: "블루", hex: "#2f5fb3", neutral: false },
  { key: "skyblue", ko: "스카이블루", hex: "#8cc4e8", neutral: false },
  { key: "red", ko: "레드", hex: "#b3322f", neutral: false },
  { key: "burgundy", ko: "버건디", hex: "#6b1f2a", neutral: false },
  { key: "pink", ko: "핑크", hex: "#e7a9b7", neutral: false },
  { key: "purple", ko: "퍼플", hex: "#6c4f8c", neutral: false },
  { key: "yellow", ko: "옐로우", hex: "#e6c24a", neutral: false },
  { key: "orange", ko: "오렌지", hex: "#d97a36", neutral: false },
];
export const colorDef = (key: string | null | undefined): ColorDef =>
  COLORS.find((c) => c.key === key) ?? { key: key ?? "gray", ko: key ?? "-", hex: "#9a9a98", neutral: true };

export const PATTERNS = [
  { key: "solid", ko: "무지" },
  { key: "stripe", ko: "스트라이프" },
  { key: "check", ko: "체크" },
  { key: "graphic", ko: "그래픽" },
  { key: "logo", ko: "로고" },
  { key: "dot", ko: "도트" },
  { key: "camo", ko: "카모" },
  { key: "other", ko: "기타" },
];

export const FITS = [
  { key: "slim", ko: "슬림" },
  { key: "regular", ko: "레귤러" },
  { key: "relaxed", ko: "릴랙스" },
  { key: "oversized", ko: "오버핏" },
  { key: "wide", ko: "와이드" },
  { key: "straight", ko: "스트레이트" },
  { key: "tapered", ko: "테이퍼드" },
];

export const STYLES = [
  { key: "casual", ko: "캐주얼" },
  { key: "minimal", ko: "미니멀" },
  { key: "street", ko: "스트릿" },
  { key: "cityboy", ko: "시티보이" },
  { key: "classic", ko: "클래식" },
  { key: "amekaji", ko: "아메카지" },
  { key: "gorpcore", ko: "고프코어" },
  { key: "sporty", ko: "스포티" },
  { key: "formal", ko: "포멀" },
];

export const SEASONS: { key: Season; ko: string }[] = [
  { key: "spring", ko: "봄" },
  { key: "summer", ko: "여름" },
  { key: "fall", ko: "가을" },
  { key: "winter", ko: "겨울" },
];

export const OCCASIONS = [
  { key: "daily", ko: "데일리" },
  { key: "work", ko: "출근/학교" },
  { key: "date", ko: "데이트" },
  { key: "travel", ko: "여행" },
  { key: "workout", ko: "운동" },
  { key: "formal", ko: "격식" },
  { key: "casual", ko: "캐주얼" },
];

export const FORMALITY = ["아주 캐주얼", "캐주얼", "스마트 캐주얼", "세미 포멀", "포멀"];

export const BODY_TYPES = ["슬림", "보통", "탄탄", "상체 발달", "하체 발달", "큰 체격"];
export const DIFFICULTY = [
  { key: "easy", ko: "무난하게" },
  { key: "normal", ko: "적당히 시도" },
  { key: "bold", ko: "과감하게" },
];
export const ACTIVITIES = ["학교", "출근", "군 복무", "운동", "여행", "야외활동", "모임"];

export const labelOf = (list: { key: string; ko: string }[], key: string | null | undefined) =>
  list.find((x) => x.key === key)?.ko ?? key ?? "";

export function currentSeason(d = new Date()): Season {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}
