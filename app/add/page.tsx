"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { GarmentGlyph } from "@/components/GarmentGlyph";
import { IconBack, IconCamera, IconCheck, IconClipboard, IconImage } from "@/components/icons";
import { autoName, blankItem, ItemForm } from "@/components/ItemForm";
import { makeCutout, type CutoutOutcome } from "@/lib/cutout";
import { processImage, type ProcessedImage } from "@/lib/image";
import { useStore } from "@/lib/store";
import type { AnalysisDraft, NewWardrobeItem } from "@/lib/types";

type Phase = "idle" | "processing" | "analyzing" | "ready" | "saving";

let aiEnabledCache: boolean | null = null;
async function aiEnabled() {
  if (aiEnabledCache !== null) return aiEnabledCache;
  try {
    const r = await fetch("/api/analyze", { method: "GET" });
    aiEnabledCache = r.ok ? !!(await r.json()).enabled : false;
  } catch {
    aiEnabledCache = false;
  }
  return aiEnabledCache;
}

function AddFlow() {
  const router = useRouter();
  const { addItem, toast } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<File[]>([]);
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [img, setImg] = useState<ProcessedImage | null>(null);
  const [form, setForm] = useState<NewWardrobeItem>(blankItem());
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const touched = useRef<Set<string>>(new Set());
  const runId = useRef(0);
  // Background removal runs alongside AI tagging.
  const [cut, setCut] = useState<(CutoutOutcome & { url: string | null }) | null>(null);
  const [useCut, setUseCut] = useState(true);
  const cutJob = useRef<Promise<CutoutOutcome> | null>(null);

  // Pre-select category from ?category=
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("category");
    if (c) setForm((f) => ({ ...f, category: c as NewWardrobeItem["category"] }));
    aiEnabled();
  }, []);

  const current = queue[0];

  // Process the head of the queue: normalise image → local colour → AI draft.
  useEffect(() => {
    if (!current) return;
    const id = ++runId.current;
    touched.current = new Set();
    setAiFields(new Set());
    setAiNote(null);
    setPhase("processing");
    (async () => {
      let decoded = false;
      try {
        const p = await processImage(current);
        decoded = true;
        if (id !== runId.current) return;
        setImg(p);
        setCut(null);
        setUseCut(true);
        cutJob.current = makeCutout(p.blob);
        cutJob.current.then((out) => {
          if (id !== runId.current) return;
          setCut({ ...out, url: out.blob ? URL.createObjectURL(out.blob) : null });
          setUseCut(out.status === "ready");
        });
        setForm((f) => ({ ...blankItem(), category: f.category, color: p.dominant }));
        setAiFields(new Set(["color"]));
        if (!(await aiEnabled())) {
          setAiNote("AI 분석이 꺼져 있어 색상만 자동으로 채웠어요. 칩을 눌러 빠르게 완성하세요.");
          setPhase("ready");
          return;
        }
        setPhase("analyzing");
        const r = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: p.aiBase64, mediaType: p.aiMediaType }),
        });
        const j = await r.json();
        if (id !== runId.current) return;
        if (!r.ok) throw new Error(j.error ?? "분석 실패");
        const d = j.draft as AnalysisDraft;
        setForm((f) => {
          const next = { ...f, ai_raw: j.raw ?? null } as NewWardrobeItem;
          const filled = new Set<string>();
          for (const [k, v] of Object.entries(d)) {
            if (v === undefined || touched.current.has(k)) continue;
            if (Array.isArray(v) && v.length === 0) continue;
            (next as unknown as Record<string, unknown>)[k] = v;
            if (v !== null) filled.add(k);
          }
          setAiFields(filled);
          return next;
        });
        setPhase("ready");
      } catch (e) {
        if (id !== runId.current) return;
        setAiNote(
          decoded
            ? `AI 분석을 건너뛰었어요 — ${e instanceof Error ? e.message : e}`
            : "이 사진 형식을 읽을 수 없어요 (HEIC 등). 사진 없이 정보만 저장하거나 JPG로 다시 시도해주세요.",
        );
        setPhase("ready");
      }
    })();
  }, [current]);

  const onForm = (v: NewWardrobeItem) => {
    for (const k of Object.keys(v) as (keyof NewWardrobeItem)[]) if (v[k] !== form[k]) touched.current.add(k);
    setForm(v);
  };

  const pickFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return 0;
    // Copy now: the FileList is emptied when the input is reset right after this call.
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!picked.length) return 0;
    setManual(false);
    setQueue((q) => [...q, ...picked]);
    return picked.length;
  };

  // Paste (Ctrl/⌘+V) a copied image or screenshot anywhere on the page. Text pastes into fields are left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const n = pickFiles(files);
      if (n) toast(n > 1 ? `사진 ${n}장을 붙여넣었어요` : "사진을 붙여넣었어요");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Button path (touch devices / no shortcut): read images straight from the clipboard. */
  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error("unsupported");
      const files: File[] = [];
      for (const entry of await navigator.clipboard.read()) {
        const type = entry.types.find((t) => t.startsWith("image/"));
        if (type) files.push(new File([await entry.getType(type)], `pasted-${Date.now()}.${type.split("/")[1]}`, { type }));
      }
      if (!pickFiles(files)) toast("클립보드에 이미지가 없어요. 사진이나 스크린샷을 복사한 뒤 다시 눌러주세요");
    } catch {
      toast("이 브라우저에서는 버튼으로 붙여넣을 수 없어요. Ctrl+V(⌘+V)로 붙여넣어 주세요");
    }
  };

  const save = async () => {
    setPhase("saving");
    try {
      const final = { ...form, name: form.name.trim() || autoName(form) };
      let cutout = null;
      if (img) {
        const out = cut ?? (cutJob.current ? await cutJob.current : null);
        cutout =
          out && out.blob && useCut
            ? { blob: out.blob, status: "ready" as const }
            : { blob: null, status: out?.status === "ready" ? ("original" as const) : ("failed" as const) };
      }
      const it = await addItem(final, img?.blob ?? null, cutout);
      if (cut?.url) URL.revokeObjectURL(cut.url);
      setCut(null);
      runId.current++; // drop any in-flight analysis for this photo
      if (img) URL.revokeObjectURL(img.preview);
      setImg(null);
      setDone((n) => n + 1);
      const rest = queue.slice(1);
      setQueue(rest);
      if (rest.length === 0) {
        setPhase("idle");
        setForm((f) => ({ ...blankItem(), category: f.category }));
        if (manual) {
          setManual(false);
          router.push(`/wardrobe/${it.id}`);
        }
        toast(`"${it.name}" 추가됨`, { label: "보기", run: () => router.push(`/wardrobe/${it.id}`) });
      }
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : e}`);
      setPhase("ready");
    }
  };

  const skip = () => {
    runId.current++;
    if (img) URL.revokeObjectURL(img.preview);
    setImg(null);
    const rest = queue.slice(1);
    setQueue(rest);
    if (!rest.length) setPhase("idle");
  };

  const reviewing = !!current || manual;
  const busy = phase === "processing" || phase === "analyzing";

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="flex items-center justify-between pb-4">
        <Link href="/wardrobe" className="-ml-2 p-2" aria-label="뒤로">
          <IconBack />
        </Link>
        <p className="eyebrow">
          Add clothes{queue.length > 1 ? ` · ${done + 1}/${done + queue.length}` : done > 0 ? ` · ${done}벌 추가됨` : ""}
        </p>
        <span className="w-10" />
      </div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pickFiles(e.target.files), (e.target.value = ""))} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => (pickFiles(e.target.files), (e.target.value = ""))} />

      {!reviewing ? (
        <div className="rise">
          <h1 className="display text-[24px]">{done > 0 ? "다음 옷을 추가하세요" : "옷 사진 한 장이면 충분해요"}</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
            밝은 바닥이나 벽에 옷을 펼쳐 놓고 정면에서 찍으면 인식이 가장 정확해요. 여러 장을 한 번에 골라 연속 등록할 수 있어요.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button onClick={() => camRef.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-lg bg-ink text-paper transition active:scale-[0.98]">
              <IconCamera width={34} height={34} strokeWidth={1.2} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em]">Take photo</span>
              <span className="text-[12px] text-paper/60">바로 촬영</span>
            </button>
            <button onClick={() => galRef.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-lg bg-card transition active:scale-[0.98]">
              <IconImage width={34} height={34} strokeWidth={1.2} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em]">From library</span>
              <span className="text-[12px] text-mute">여러 장 선택 가능</span>
            </button>
          </div>
          <button
            onClick={pasteFromClipboard}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 py-3.5 text-[13px] font-semibold text-ink-2 transition hover:border-ink active:scale-[0.99]"
          >
            <IconClipboard width={17} height={17} />
            클립보드에서 붙여넣기
            <span className="hidden font-normal text-mute sm:inline">· Ctrl+V / ⌘V</span>
          </button>
          <button
            onClick={() => {
              setManual(true);
              setImg(null);
              setAiFields(new Set());
              setAiNote(null);
              setPhase("ready");
            }}
            className="mt-5 w-full text-center text-[13px] text-mute underline underline-offset-4"
          >
            사진 없이 직접 입력
          </button>
          {done > 0 && (
            <Link href="/wardrobe" className="btn btn-line mt-8 w-full">
              옷장으로 ({done}벌 추가됨)
            </Link>
          )}
        </div>
      ) : (
        <div className="rise">
          {/* Preview: transparent garment asset (or the original photo) */}
          <div className={`relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-lg p-6 ${img && useCut && cut?.url ? "checker" : "bg-card"}`}>
            {img ? (
              useCut && cut?.url ? (
                <img src={cut.url} alt="" className="garment-cutout h-full w-full object-contain" />
              ) : (
                <img src={img.preview} alt="" className="garment-img h-full w-full object-contain" />
              )
            ) : phase === "processing" ? (
              <div className="shimmer absolute inset-0" />
            ) : (
              <GarmentGlyph category={form.category} subcategory={form.subcategory} color={form.color} pattern={form.pattern} fit={form.fit} className="h-full w-full" />
            )}
            {(busy || (img && !cut)) && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-[12px] text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {phase === "processing" ? "사진 정리 중…" : !cut ? "배경 분리 중…" : "옷 정보를 읽는 중…"}
              </div>
            )}
          </div>
          {img && cut && (
            <div className="mx-auto mt-3 flex max-w-[320px] items-center gap-2">
              <div className="flex rounded-md border border-line p-0.5">
                <button
                  disabled={!cut.blob}
                  onClick={() => setUseCut(true)}
                  className={`rounded px-3 py-1.5 text-[12px] font-semibold ${useCut && cut.blob ? "bg-ink text-paper" : "text-mute"} disabled:opacity-40`}
                >
                  배경 제거
                </button>
                <button
                  onClick={() => setUseCut(false)}
                  className={`rounded px-3 py-1.5 text-[12px] font-semibold ${!useCut || !cut.blob ? "bg-ink text-paper" : "text-mute"}`}
                >
                  원본
                </button>
              </div>
              <p className="text-[11.5px] leading-snug text-mute">
                {cut.blob ? "마네킹에는 배경 없는 옷이 입혀져요" : "배경 분리가 어려운 사진이라 원본을 사용해요"}
              </p>
            </div>
          )}

          {aiNote && <p className="mt-4 rounded-md bg-card px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">{aiNote}</p>}

          <div className={`mt-2 transition-opacity ${phase === "analyzing" ? "opacity-60" : ""}`}>
            <ItemForm value={form} onChange={onForm} aiFields={aiFields} />
          </div>

          <div className="safe-bottom sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
            <button className="btn btn-ghost" onClick={manual ? () => (setManual(false), setPhase("idle")) : skip}>
              {manual ? "취소" : queue.length > 1 ? "건너뛰기" : "다시 찍기"}
            </button>
            <button className="btn btn-dark flex-1" onClick={save} disabled={phase === "saving" || phase === "processing"}>
              <IconCheck width={18} height={18} />
              {phase === "saving" ? "저장 중" : queue.length > 1 ? "저장하고 다음" : "옷장에 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddFlow />
    </Suspense>
  );
}
