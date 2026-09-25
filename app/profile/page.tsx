"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ChipGroup, ColorPicker, Field, Loading, PageHeader, Sheet } from "@/components/ui";
import { AccountSection } from "@/components/CloudAccount";
import { processImage } from "@/lib/image";
import { DEFAULT_PREFS } from "@/lib/repo/types";
import { useStore } from "@/lib/store";
import { ACTIVITIES, BODY_TYPES, COLORS, DIFFICULTY, STYLES } from "@/lib/taxonomy";
import type { PersonImage, Preferences } from "@/lib/types";

const GENDERS = [
  { key: "men", ko: "남성" },
  { key: "women", ko: "여성" },
  { key: "none", ko: "선택 안 함" },
];
const FIT_PREF = [
  { key: "oversized", ko: "오버핏 선호" },
  { key: "regular", ko: "정핏 선호" },
  { key: "slim", ko: "슬림핏 선호" },
];

export default function ProfilePage() {
  const { ready, prefs, savePrefs, toast, backend, items, outfits, logs, seedSample, getPerson, setPerson } = useStore();
  const [p, setP] = useState<Preferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [bodyPhoto, setBodyPhoto] = useState<PersonImage | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready) setP(prefs);
  }, [ready, prefs]);

  useEffect(() => {
    if (!ready) return;
    getPerson("photo")
      .then(setBodyPhoto)
      .catch(() => setBodyPhoto(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const changePhoto = async (file: File | null) => {
    setPhotoBusy(true);
    try {
      const blob = file ? (await processImage(file)).blob : null;
      setBodyPhoto(await setPerson("photo", blob));
      toast(file ? "전신 사진을 저장했어요" : "전신 사진을 삭제했어요");
    } catch (e) {
      toast(`사진 저장 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!ready) return <Loading />;

  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  const exportJson = () => {
    const data = { exported_at: new Date().toISOString(), prefs, items: items.map(({ image_url: _u, ...i }) => i), outfits, wear_logs: logs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `closet-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader eyebrow="Profile" title="나의 스타일" />
      <p className="-mt-2 mb-2 text-[13.5px] leading-relaxed text-mute">
        코디 추천에만 쓰여요. 모든 항목은 선택이고, 신체 치수는 묻지 않아요.
      </p>

      <div className="divide-y divide-line">
        <Field label="이름 (홈 인사에 표시)">
          <input className="field" value={p.display_name} placeholder="닉네임" onChange={(e) => set("display_name", e.target.value)} />
        </Field>
        <Field label="성별">
          <ChipGroup options={GENDERS} value={p.gender} onChange={(v) => set("gender", (v as string) ?? null)} />
        </Field>
        <Field label="키" hint="선택">
          <div className="flex items-center gap-2">
            <input
              className="field w-28"
              inputMode="numeric"
              placeholder="175"
              value={p.height_cm ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                set("height_cm", Number.isFinite(n) ? Math.min(230, n) : null);
              }}
            />
            <span className="text-[14px] text-mute">cm</span>
          </div>
        </Field>
        <Field label="체형" hint="여러 개 선택">
          <ChipGroup options={BODY_TYPES.map((b) => ({ key: b, ko: b }))} value={p.body_type} onChange={(v) => set("body_type", (v as string[]) ?? [])} multiple />
        </Field>
        <Field label="내 전신 사진" hint="AI 착용용 · 선택">
          <div className="flex items-start gap-3">
            <div className="grid aspect-[3/4] w-[84px] shrink-0 place-items-center overflow-hidden rounded-md bg-card">
              {bodyPhoto ? (
                <img src={bodyPhoto.url} alt="내 전신 사진" className="h-full w-full object-cover" />
              ) : (
                <span className="px-2 text-center text-[11px] leading-snug text-mute">기본 모델 사용</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-relaxed text-mute">
                정면 전신 사진을 올리면 AI TRY-ON에서 이 사진에 옷을 입혀요. 없으면 성별·키·체형에 맞춘 기본 모델을 한 번 만들어 써요. 사진은 AI 착용 이미지를 만들 때만 Google Gemini로 전송돼요.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button className="chip" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                  {photoBusy ? "저장 중…" : bodyPhoto ? "사진 교체" : "사진 올리기"}
                </button>
                {bodyPhoto && (
                  <button className="chip" disabled={photoBusy} onClick={() => changePhoto(null)}>
                    삭제
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        </Field>
        <Field label="선호 핏">
          <ChipGroup options={FIT_PREF} value={p.preferred_fit} onChange={(v) => set("preferred_fit", (v as string) ?? null)} />
        </Field>
        <Field label="선호 스타일">
          <ChipGroup options={STYLES} value={p.preferred_styles} onChange={(v) => set("preferred_styles", (v as string[]) ?? [])} multiple />
        </Field>
        <Field label="자주 입는 색">
          <ColorPicker options={COLORS} value={p.favorite_colors} onChange={(v) => set("favorite_colors", (v as string[]) ?? [])} multiple />
        </Field>
        <Field label="피하고 싶은 색" hint="추천에서 제외돼요">
          <ColorPicker options={COLORS} value={p.avoid_colors} onChange={(v) => set("avoid_colors", (v as string[]) ?? [])} multiple />
        </Field>
        <Field label="선호 브랜드">
          <input className="field" value={p.brands} placeholder="예: 유니클로, 포터리, 뉴발란스" onChange={(e) => set("brands", e.target.value)} />
        </Field>
        <Field label="평소 활동">
          <ChipGroup options={ACTIVITIES.map((a) => ({ key: a, ko: a }))} value={p.activities} onChange={(v) => set("activities", (v as string[]) ?? [])} multiple />
        </Field>
        <Field label="코디 난이도">
          <ChipGroup options={DIFFICULTY} value={p.difficulty} onChange={(v) => set("difficulty", (v as string) ?? null)} />
        </Field>
      </div>

      <div className="safe-bottom sticky bottom-[62px] z-10 -mx-4 mt-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:bottom-0">
        <button
          className="btn btn-dark w-full"
          disabled={!dirty}
          onClick={async () => {
            await savePrefs(p);
            setDirty(false);
            toast("저장했어요");
          }}
        >
          {dirty ? "저장" : "저장됨"}
        </button>
      </div>

      <section className="mt-14">
        <p className="eyebrow mb-3">Data</p>
        <div className="divide-y divide-line border-y border-line text-[14px]">
          <div className="flex justify-between py-3">
            <span className="text-mute">저장 위치</span>
            <span>{backend === "supabase" ? "Supabase (클라우드)" : "이 기기 브라우저"}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-mute">옷 · 코디 · 착용 기록</span>
            <span>
              {items.length} · {outfits.length} · {logs.length}
            </span>
          </div>
          <button className="flex w-full justify-between py-3 text-left" onClick={exportJson}>
            <span>백업 내보내기 (JSON)</span>
            <span className="text-mute">↓</span>
          </button>
          <button className="flex w-full justify-between py-3 text-left" onClick={() => setSeedOpen(true)}>
            <span>샘플 옷 22벌 추가</span>
            <span className="text-mute">+</span>
          </button>
        </div>
        {backend === "local" && (
          <p className="mt-3 text-[12px] leading-relaxed text-mute">
            로컬 모드에서는 브라우저 데이터를 지우면 옷장도 지워져요. 여러 기기에서 쓰려면 Supabase를 연결하세요 (README 참고).
          </p>
        )}
      </section>

      <AccountSection />

      <Sheet open={seedOpen} onClose={() => setSeedOpen(false)} title="샘플 옷장 추가">
        <p className="text-[14px] leading-relaxed text-ink-2">체험용 옷 22벌과 착용 기록이 지금 옷장에 더해져요. 나중에 옷별로 삭제할 수 있어요.</p>
        <button
          className="btn btn-dark mt-6 w-full"
          onClick={async () => {
            setSeedOpen(false);
            await seedSample();
            toast("샘플 옷장을 추가했어요");
          }}
        >
          추가
        </button>
      </Sheet>
    </div>
  );
}
