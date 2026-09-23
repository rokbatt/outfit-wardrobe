"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconPlus, IconTrash } from "@/components/icons";
import { OutfitBoard, selFromRefs } from "@/components/OutfitBoard";
import { Empty, Loading, PageHeader, Sheet } from "@/components/ui";
import { todayISO, useStore } from "@/lib/store";
import { daysSince } from "@/lib/styling";
import { labelOf, OCCASIONS } from "@/lib/taxonomy";
import type { Outfit } from "@/lib/types";

export default function OutfitsPage() {
  const { ready, outfits, itemById, wear, deleteOutfit, toast } = useStore();
  const [occ, setOcc] = useState<string | "all">("all");
  const [del, setDel] = useState<Outfit | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of outfits) m.set(o.occasion, (m.get(o.occasion) ?? 0) + 1);
    return m;
  }, [outfits]);
  const list = outfits.filter((o) => occ === "all" || o.occasion === occ);

  if (!ready) return <Loading />;

  return (
    <div>
      <PageHeader
        eyebrow={`${outfits.length} outfits`}
        title="내 코디"
        right={
          <Link href="/outfit" className="btn btn-dark btn-sm">
            <IconPlus width={15} height={15} /> 새 코디
          </Link>
        }
      />

      {outfits.length === 0 ? (
        <Empty
          title="저장한 코디가 없어요"
          body="Outfit Builder에서 옷을 조합하고 저장하면 여기에 모여요."
          action={
            <Link href="/outfit" className="btn btn-dark">
              코디 만들기
            </Link>
          }
        />
      ) : (
        <>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <button className="chip" data-on={occ === "all"} onClick={() => setOcc("all")}>
              전체 {outfits.length}
            </button>
            {OCCASIONS.filter((o) => counts.get(o.key)).map((o) => (
              <button key={o.key} className="chip" data-on={occ === o.key} onClick={() => setOcc(o.key)}>
                {o.ko} {counts.get(o.key)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-2.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-3">
            {list.map((o) => {
              const since = daysSince(o.last_worn_at);
              const wornToday = o.last_worn_at === todayISO();
              return (
                <div key={o.id} className="rise">
                  <Link href={`/outfit?outfit=${o.id}`}>
                    <OutfitBoard sel={selFromRefs(o.items, itemById)} render={o.render} />
                  </Link>
                  <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{o.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-mute">
                        {labelOf(OCCASIONS, o.occasion)}
                        {o.outfit_date ? ` · ${o.outfit_date.slice(5).replace("-", ".")}` : ""} · {o.wear_count ? `${o.wear_count}회${since !== null ? ` · ${since === 0 ? "오늘" : `${since}일 전`}` : ""}` : "아직 안 입음"}
                      </p>
                    </div>
                    <button aria-label="삭제" className="-mr-1 p-1 text-mute hover:text-danger" onClick={() => setDel(o)}>
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                  <button
                    disabled={wornToday}
                    className="btn btn-line btn-sm mt-2 w-full"
                    onClick={() => wear(o.items.map((r) => r.wardrobe_item_id), o.id)}
                  >
                    {wornToday ? "오늘 입음 ✓" : "입었어요"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Sheet open={!!del} onClose={() => setDel(null)} title="코디를 삭제할까요?">
        <p className="text-[14px] text-ink-2">옷은 그대로 남고, 이 조합만 삭제돼요. 착용 기록은 유지돼요.</p>
        <div className="mt-6 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setDel(null)}>
            취소
          </button>
          <button
            className="btn flex-1 bg-danger text-white"
            onClick={async () => {
              if (del) await deleteOutfit(del.id);
              setDel(null);
              toast("삭제했어요");
            }}
          >
            삭제
          </button>
        </div>
      </Sheet>
    </div>
  );
}
