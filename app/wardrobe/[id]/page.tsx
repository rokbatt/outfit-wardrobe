"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { IconBack, IconShuffle, IconTrash } from "@/components/icons";
import { ItemForm } from "@/components/ItemForm";
import { ItemVisual } from "@/components/ItemVisual";
import { OutfitBoard, selFromRefs } from "@/components/OutfitBoard";
import { ColorDot, Loading, Sheet } from "@/components/ui";
import { makeCutout } from "@/lib/cutout";
import { processImage } from "@/lib/image";
import { useStore } from "@/lib/store";
import { daysSince, DORMANT_DAYS, generateOutfit, type Selection } from "@/lib/styling";
import { categoryLabel, colorDef, FITS, HEM_LENGTHS, FORMALITY, labelOf, PATTERNS, SEASONS, STYLES } from "@/lib/taxonomy";
import type { NewWardrobeItem, Slot } from "@/lib/types";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, itemById, items, outfits, prefs, updateItem, deleteItem, wear, toast, setCutout } = useStore();
  const [cutBusy, setCutBusy] = useState(false);
  const item = itemById.get(id);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NewWardrobeItem | null>(null);
  const [newImg, setNewImg] = useState<Blob | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [seed, setSeed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestion = useMemo<Selection | null>(() => {
    if (!item) return null;
    void seed;
    const s = generateOutfit(items, { favorItemId: item.id, prefs, samples: 100 });
    if (!s) return null;
    const { _reasons, ...sel } = s;
    void _reasons;
    return Object.keys(sel).length > 1 ? sel : null;
  }, [item, items, prefs, seed]);

  const newImgUrl = useMemo(() => (newImg ? URL.createObjectURL(newImg) : null), [newImg]);
  const usedIn = useMemo(() => outfits.filter((o) => o.items.some((r) => r.wardrobe_item_id === id)), [outfits, id]);

  if (!ready) return <Loading />;
  if (!item)
    return (
      <div className="py-20 text-center">
        <p className="text-mute">옷을 찾을 수 없어요.</p>
        <Link href="/wardrobe" className="btn btn-line mt-6">
          옷장으로
        </Link>
      </div>
    );

  const redoCutout = async () => {
    if (!item.image_url) return;
    setCutBusy(true);
    try {
      const out = await makeCutout(await (await fetch(item.image_url)).blob());
      await setCutout(item.id, { blob: out.blob, status: out.status });
      toast(out.blob ? "배경을 제거했어요" : "이 사진은 자동 분리가 어려워요 · 원본을 사용해요");
    } finally {
      setCutBusy(false);
    }
  };

  const since = daysSince(item.last_worn_at);
  const sleeping = since === null ? (daysSince(item.created_at) ?? 0) >= 7 : since >= DORMANT_DAYS;

  const startEdit = () => {
    const { id: _i, image_url: _u, cutout_url: _cu, cutout_status: _cs, wear_count: _w, last_worn_at: _l, created_at: _c, updated_at: _up, ...rest } = item;
    setDraft(rest);
    setNewImg(undefined);
    setEditing(true);
  };

  const tags: [string, string][] = [
    ["카테고리", `${categoryLabel(item.category)} · ${item.subcategory || "-"}`],
    ["핏", labelOf(FITS, item.fit) || "-"],
    ...(item.hem_length ? [["기장", HEM_LENGTHS.filter((h) => h.key === item.hem_length).map((h) => `${h.ko} · ${h.sub}`)[0] ?? "-"] as [string, string]] : []),
    ["패턴", labelOf(PATTERNS, item.pattern)],
    ["스타일", item.style.map((s) => labelOf(STYLES, s)).join(", ") || "-"],
    ["계절", item.season.map((s) => labelOf(SEASONS, s)).join(" · ") || "-"],
    ["격식", FORMALITY[item.formality - 1]],
    ...(item.material ? [["소재", item.material] as [string, string]] : []),
    ...(item.brand ? [["브랜드", item.brand] as [string, string]] : []),
  ];

  const suggestionRefs = suggestion ? (Object.entries(suggestion) as [Slot, { id: string }][]) : [];

  return (
    <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-12">
      <div>
        <div className="flex items-center justify-between pb-3 lg:hidden">
          <button onClick={() => router.back()} className="tap -ml-2 p-2" aria-label="뒤로">
            <IconBack />
          </button>
          <button onClick={startEdit} className="-mr-2 px-2 py-3 text-[13px] font-semibold uppercase tracking-[0.1em]">
            Edit
          </button>
        </div>
        {/* phones: cap the photo so the name, stats and actions start on the first screen */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-card p-8 max-lg:max-h-[52dvh] max-lg:w-full lg:sticky lg:top-10">
          <ItemVisual item={item} />
          {item.image_url && (
            <span className="absolute bottom-3 left-3 rounded bg-paper/90 px-2 py-1 text-[10.5px] font-semibold text-ink-2">
              {item.cutout_status === "ready" ? "배경 제거됨" : item.cutout_status === null ? "배경 분리 대기" : "원본 사진"}
            </span>
          )}
          {sleeping && (
            <span className="absolute left-4 top-4 rounded-full bg-paper px-3 py-1 text-[11px] font-semibold tracking-[0.08em]">
              {since === null ? "아직 안 입은 옷" : `${since}일째 잠든 옷`}
            </span>
          )}
        </div>
      </div>

      <div className="pt-6 lg:pt-0">
        <div className="hidden items-center justify-between pb-6 lg:flex">
          <Link href="/wardrobe" className="eyebrow hover:text-ink">
            ← Wardrobe
          </Link>
          <button onClick={startEdit} className="btn btn-line btn-sm">
            Edit
          </button>
        </div>
        <p className="eyebrow flex items-center gap-2">
          <ColorDot color={item.color} size={10} /> {colorDef(item.color).ko}
          {item.secondary_color && (
            <>
              <ColorDot color={item.secondary_color} size={10} /> {colorDef(item.secondary_color).ko}
            </>
          )}
        </p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight lg:text-[26px]">{item.name}</h1>

        <div className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line py-4 text-center">
          <div>
            <p className="text-[20px] font-bold">{item.wear_count}</p>
            <p className="eyebrow mt-1">착용</p>
          </div>
          <div>
            <p className="text-[20px] font-bold">{since === null ? "—" : since === 0 ? "오늘" : `${since}일`}</p>
            <p className="eyebrow mt-1">마지막 착용</p>
          </div>
          <div>
            <p className="text-[20px] font-bold">{usedIn.length}</p>
            <p className="eyebrow mt-1">저장 코디</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Link href={`/outfit?with=${item.id}`} className="btn btn-dark flex-1">
            마네킹에 입혀보기
          </Link>
          <button className="btn btn-line" onClick={() => wear([item.id])}>
            오늘 입음
          </button>
        </div>

        <dl className="mt-8 divide-y divide-line">
          {tags.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-3 text-[14px]">
              <dt className="w-20 shrink-0 text-mute">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {item.notes && (
            <div className="flex gap-4 py-3 text-[14px]">
              <dt className="w-20 shrink-0 text-mute">메모</dt>
              <dd className="whitespace-pre-wrap">{item.notes}</dd>
            </div>
          )}
        </dl>

        {item.image_url && (
          <section className="mt-6 rounded-md border border-line p-3">
            <p className="text-[12.5px] font-bold">마네킹용 이미지</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className="chip" disabled={cutBusy} onClick={redoCutout}>
                {cutBusy ? "처리 중…" : item.cutout_status === "ready" ? "배경 다시 제거" : "배경 제거하기"}
              </button>
              {item.cutout_status === "ready" && (
                <button className="chip" onClick={() => setCutout(item.id, { blob: null, status: "original" }).then(() => toast("원본 사진을 사용해요"))}>
                  원본 사용
                </button>
              )}
              <Link href={`/outfit?with=${item.id}&adjust=1`} className="chip">
                위치·크기 조정
              </Link>
            </div>
          </section>
        )}

        {suggestion && (
          <section className="mt-10">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="eyebrow">Try it on</p>
                <h2 className="mt-1 text-[17px] font-semibold">내 옷장으로 만든 조합</h2>
              </div>
              <button onClick={() => setSeed((s) => s + 1)} className="chip" aria-label="다른 조합">
                <IconShuffle width={16} height={16} /> 다른 조합
              </button>
            </div>
            <Link href={`/outfit?${suggestionRefs.map(([s, it]) => `${s}=${it.id}`).join("&")}`} className="block">
              <OutfitBoard sel={suggestion} className="max-w-[300px] max-lg:max-w-none" />
            </Link>
            <p className="mt-2 text-[12.5px] text-mute">누르면 Outfit Builder에서 이어서 바꿀 수 있어요.</p>
          </section>
        )}

        {usedIn.length > 0 && (
          <section className="mt-10">
            <p className="eyebrow mb-3">Saved outfits with this</p>
            <div className="grid grid-cols-3 gap-2">
              {usedIn.map((o) => (
                <Link key={o.id} href={`/outfit?outfit=${o.id}`}>
                  <OutfitBoard sel={selFromRefs(o.items, itemById)} />
                  <p className="mt-1 truncate text-[12px]">{o.name}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <button onClick={() => setConfirmDel(true)} className="mt-12 flex items-center gap-2 text-[13px] text-danger">
          <IconTrash width={16} height={16} /> 옷장에서 삭제
        </button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="정보 수정">
        {draft && (
          <>
            <div className="flex items-center gap-3 py-2">
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-card p-1.5">
                <ItemVisual item={{ ...item, ...draft, image_url: newImg === null ? null : newImgUrl ?? item.image_url }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="chip" onClick={() => fileRef.current?.click()}>
                  사진 {item.image_url ? "교체" : "추가"}
                </button>
                {(item.image_url || newImg) && newImg !== null && (
                  <button className="chip" onClick={() => setNewImg(null)}>
                    사진 삭제
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    const p = await processImage(f);
                    setNewImg(p.blob);
                  } catch {
                    toast("사진을 읽을 수 없어요");
                  }
                }}
              />
            </div>
            <ItemForm value={draft} onChange={setDraft} />
            <div className="sticky bottom-0 -mx-5 mt-2 flex gap-2 bg-paper px-5 pt-3">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                취소
              </button>
              <button
                className="btn btn-dark flex-1"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateItem(item.id, { ...draft, name: draft.name.trim() || item.name }, newImg);
                    setEditing(false);
                    toast("수정했어요");
                  } catch (e) {
                    toast(`저장 실패: ${e instanceof Error ? e.message : e}`);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "저장 중" : "저장"}
              </button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="이 옷을 삭제할까요?">
        <p className="text-[14px] leading-relaxed text-ink-2">
          착용 기록에서도 빠지고, 이 옷만으로 구성된 저장 코디는 함께 삭제돼요. 되돌릴 수 없어요.
        </p>
        <div className="mt-6 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirmDel(false)}>
            취소
          </button>
          <button
            className="btn flex-1 bg-danger text-white"
            onClick={async () => {
              await deleteItem(item.id);
              toast("삭제했어요");
              router.replace("/wardrobe");
            }}
          >
            삭제
          </button>
        </div>
      </Sheet>
    </div>
  );
}
