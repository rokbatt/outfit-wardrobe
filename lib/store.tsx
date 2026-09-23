"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LocalRepo } from "./repo/local";
import { SupabaseRepo } from "./repo/supabase";
import { DEFAULT_PREFS, type CutoutInput, type Repo } from "./repo/types";
import { SAMPLE_ITEMS, SAMPLE_WEARS } from "./sample";
import type { NewOutfit, NewWardrobeItem, Outfit, Preferences, WardrobeItem, WearLog } from "./types";

interface Ctx {
  ready: boolean;
  error: string | null;
  backend: Repo["kind"] | null;
  items: WardrobeItem[];
  outfits: Outfit[];
  logs: WearLog[];
  prefs: Preferences;
  itemById: Map<string, WardrobeItem>;

  addItem(input: NewWardrobeItem, image: Blob | null, cutout?: CutoutInput | null): Promise<WardrobeItem>;
  setCutout(id: string, cutout: CutoutInput): Promise<WardrobeItem>;
  updateItem(id: string, patch: Partial<NewWardrobeItem>, image?: Blob | null): Promise<WardrobeItem>;
  deleteItem(id: string): Promise<void>;
  saveOutfit(input: NewOutfit): Promise<Outfit>;
  updateOutfit(id: string, patch: Partial<NewOutfit>): Promise<Outfit>;
  deleteOutfit(id: string): Promise<void>;
  wear(item_ids: string[], outfit_id?: string | null, worn_at?: string): Promise<void>;
  undoWear(logId: string): Promise<void>;
  savePrefs(p: Preferences): Promise<void>;
  seedSample(): Promise<void>;

  toast(msg: string, action?: { label: string; run: () => void }): void;
}

const StoreCtx = createContext<Ctx | null>(null);

export const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

function makeRepo(): Repo {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseRepo(url, key) : new LocalRepo();
}

type ToastState = { id: number; msg: string; action?: { label: string; run: () => void } } | null;

export function StoreProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [logs, setLogs] = useState<WearLog[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [toastState, setToast] = useState<ToastState>(null);

  const repo = () => {
    if (!repoRef.current) throw new Error("repo not ready");
    return repoRef.current;
  };

  const refresh = useCallback(async () => {
    const r = repo();
    const [i, o, l, p] = await Promise.all([r.listItems(), r.listOutfits(), r.listWearLogs(), r.getPreferences()]);
    setItems(i);
    setOutfits(o);
    setLogs(l);
    setPrefs(p);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = makeRepo();
        await r.init();
        repoRef.current = r;
        await refresh();
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const toast = useCallback<Ctx["toast"]>((msg, action) => {
    const id = Date.now();
    setToast({ id, msg, action });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 5000 : 2600);
  }, []);

  const value = useMemo<Ctx>(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    return {
      ready,
      error,
      backend: repoRef.current?.kind ?? null,
      items,
      outfits,
      logs,
      prefs,
      itemById,
      async addItem(input, image, cutout) {
        const it = await repo().createItem(input, image, cutout);
        setItems((xs) => [it, ...xs]);
        return it;
      },
      async setCutout(id, cutout) {
        const it = await repo().setCutout(id, cutout);
        setItems((xs) => xs.map((x) => (x.id === id ? { ...it, wear_count: x.wear_count, last_worn_at: x.last_worn_at } : x)));
        return it;
      },
      async updateItem(id, patch, image) {
        const it = await repo().updateItem(id, patch, image);
        setItems((xs) => xs.map((x) => (x.id === id ? { ...it, wear_count: x.wear_count, last_worn_at: x.last_worn_at } : x)));
        return it;
      },
      async deleteItem(id) {
        await repo().deleteItem(id);
        await refresh();
      },
      async saveOutfit(input) {
        const o = await repo().createOutfit(input);
        setOutfits((xs) => [o, ...xs]);
        return o;
      },
      async updateOutfit(id, patch) {
        const o = await repo().updateOutfit(id, patch);
        setOutfits((xs) => xs.map((x) => (x.id === id ? { ...o, wear_count: x.wear_count, last_worn_at: x.last_worn_at } : x)));
        return o;
      },
      async deleteOutfit(id) {
        await repo().deleteOutfit(id);
        setOutfits((xs) => xs.filter((x) => x.id !== id));
      },
      async wear(item_ids, outfit_id = null, worn_at = todayISO()) {
        const log = await repo().logWear({ item_ids, outfit_id, worn_at });
        await refresh();
        toast("오늘 착용으로 기록했어요", {
          label: "취소",
          run: () => {
            repo().deleteWearLog(log.id).then(refresh);
          },
        });
      },
      async undoWear(logId) {
        await repo().deleteWearLog(logId);
        await refresh();
      },
      async savePrefs(p) {
        await repo().savePreferences(p);
        setPrefs(p);
      },
      async seedSample() {
        const r = repo();
        const ids = new Map<string, string>();
        // Stagger created_at by inserting oldest first.
        for (const { key, ...input } of SAMPLE_ITEMS) {
          const it = await r.createItem(input, null);
          ids.set(key, it.id);
        }
        const now = Date.now();
        for (const w of SAMPLE_WEARS) {
          const d = new Date(now - w.daysAgo * 86_400_000);
          const worn_at = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
          await r.logWear({ worn_at, outfit_id: null, item_ids: w.keys.map((k) => ids.get(k)!).filter(Boolean) });
        }
        await refresh();
      },
      toast,
    };
  }, [ready, error, items, outfits, logs, prefs, refresh, toast]);

  return (
    <StoreCtx.Provider value={value}>
      {children}
      {toastState && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
          <div className="toast-in pointer-events-auto flex items-center gap-4 rounded-full bg-ink px-5 py-3 text-[13px] text-paper shadow-lg">
            <span>{toastState.msg}</span>
            {toastState.action && (
              <button
                className="font-semibold underline underline-offset-4"
                onClick={() => {
                  toastState.action?.run();
                  setToast(null);
                }}
              >
                {toastState.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}
