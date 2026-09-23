"use client";

import { useState } from "react";
import { CATEGORIES, COLORS, FITS, FORMALITY, PATTERNS, SEASONS, STYLES, SUBCATEGORIES } from "@/lib/taxonomy";
import type { Category, NewWardrobeItem, Season } from "@/lib/types";
import { ChipGroup, ColorPicker, Field } from "./ui";

export function blankItem(): NewWardrobeItem {
  return {
    name: "",
    category: "top",
    subcategory: "",
    color: "black",
    secondary_color: null,
    pattern: "solid",
    material: null,
    fit: null,
    style: [],
    season: [],
    gender: null,
    brand: null,
    formality: 2,
    notes: null,
    ai_raw: null,
    placement: null,
  };
}

/** Suggest a name from attributes when the user hasn't typed one. */
export function autoName(v: NewWardrobeItem) {
  const color = COLORS.find((c) => c.key === v.color)?.ko ?? "";
  const fit = v.fit === "oversized" ? "오버핏" : v.fit === "wide" ? "와이드" : v.fit === "slim" ? "슬림" : "";
  const sub = v.subcategory || CATEGORIES.find((c) => c.key === v.category)?.ko || "";
  return [color, fit && !sub.includes(fit) ? fit : "", sub].filter(Boolean).join(" ");
}

/**
 * Review/edit form. AI output lands here as a draft; every field stays editable.
 * Primary fields are visible; rarely-needed ones sit behind "세부 정보".
 */
export function ItemForm({
  value,
  onChange,
  aiFields,
}: {
  value: NewWardrobeItem;
  onChange: (v: NewWardrobeItem) => void;
  aiFields?: Set<string>; // fields filled by AI — shown with a subtle marker
}) {
  const [more, setMore] = useState(false);
  const set = <K extends keyof NewWardrobeItem>(k: K, v: NewWardrobeItem[K]) => onChange({ ...value, [k]: v });
  const mark = (k: string) => (aiFields?.has(k) ? "AI 추정 · 수정 가능" : undefined);
  const subs = SUBCATEGORIES[value.category];

  return (
    <div className="divide-y divide-line">
      <Field label="이름" hint={mark("name")}>
        <input
          className="field"
          value={value.name}
          placeholder={autoName(value) || "예: 검정 오버핏 반팔 티셔츠"}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="카테고리" hint={mark("category")}>
        <ChipGroup
          options={CATEGORIES.map((c) => ({ key: c.key, ko: c.ko }))}
          value={value.category}
          onChange={(v) => v && onChange({ ...value, category: v as Category, subcategory: SUBCATEGORIES[v as Category].includes(value.subcategory) ? value.subcategory : "" })}
        />
        <div className="mt-3">
          <ChipGroup
            wrap={false}
            options={[...new Set([...subs, ...(value.subcategory && !subs.includes(value.subcategory) ? [value.subcategory] : [])])].map((s) => ({ key: s, ko: s }))}
            value={value.subcategory || null}
            onChange={(v) => set("subcategory", (v as string) ?? "")}
          />
        </div>
      </Field>

      <Field label="색상" hint={mark("color")}>
        <ColorPicker options={COLORS} value={value.color} onChange={(v) => v && set("color", v as string)} />
      </Field>

      <Field label="스타일" hint={mark("style") ?? "여러 개 선택"}>
        <ChipGroup options={STYLES} value={value.style} onChange={(v) => set("style", (v as string[]) ?? [])} multiple />
      </Field>

      <Field label="계절" hint={mark("season")}>
        <ChipGroup options={SEASONS} value={value.season} onChange={(v) => set("season", ((v as Season[]) ?? []) as Season[])} multiple />
      </Field>

      <Field label="핏" hint={mark("fit")}>
        <ChipGroup options={FITS} value={value.fit} onChange={(v) => set("fit", (v as string) ?? null)} />
      </Field>

      <Field label="격식" hint={FORMALITY[value.formality - 1]}>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => set("formality", n)}
              className={`h-9 flex-1 rounded-full border text-[12px] transition ${n <= value.formality ? "border-ink bg-ink text-paper" : "border-line text-mute"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-mute">
          <span>캐주얼</span>
          <span>포멀</span>
        </div>
      </Field>

      {!more ? (
        <div className="py-4">
          <button type="button" className="text-[13px] font-medium text-ink-2 underline underline-offset-4" onClick={() => setMore(true)}>
            세부 정보 (패턴·보조색·소재·브랜드·메모)
          </button>
        </div>
      ) : (
        <>
          <Field label="패턴" hint={mark("pattern")}>
            <ChipGroup options={PATTERNS} value={value.pattern} onChange={(v) => set("pattern", (v as string) ?? "solid")} />
          </Field>
          <Field label="보조 색상" hint={mark("secondary_color")}>
            <ColorPicker options={COLORS} value={value.secondary_color} onChange={(v) => set("secondary_color", (v as string) ?? null)} allowNone />
          </Field>
          <Field label="소재 · 브랜드">
            <div className="grid grid-cols-2 gap-2">
              <input className="field" placeholder="소재 (예: 코튼)" value={value.material ?? ""} onChange={(e) => set("material", e.target.value || null)} />
              <input className="field" placeholder="브랜드" value={value.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)} />
            </div>
          </Field>
          <Field label="메모">
            <textarea
              className="field h-auto min-h-[72px] py-3"
              placeholder="사이즈, 구매처, 관리 방법 등"
              value={value.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </Field>
        </>
      )}
    </div>
  );
}
