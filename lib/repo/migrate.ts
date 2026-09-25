import type { NewWardrobeItem, WardrobeItem } from "../types";
import { LocalRepo } from "./local";
import type { Repo } from "./types";

/*
 * One-way copy of the on-device wardrobe (IndexedDB) into another repo (Supabase).
 * The local data is only read, never changed or deleted, so it stays as a fallback.
 * Progress is remembered per target account, so an interrupted copy resumes without duplicates.
 */

const MAP_KEY = (account: string) => `closet.import.${account}`;
type ImportMap = Record<string, string>; // "i:<local id>" / "o:…" / "l:…" / "prefs" / "person" → remote id or "1"

function readMap(account: string): ImportMap {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY(account)) ?? "{}") as ImportMap;
  } catch {
    return {};
  }
}
function writeMap(account: string, m: ImportMap) {
  try {
    localStorage.setItem(MAP_KEY(account), JSON.stringify(m));
  } catch {
    /* storage blocked → the copy still runs, it just can't resume */
  }
}

async function openLocal(): Promise<LocalRepo> {
  const local = new LocalRepo();
  await local.init();
  return local;
}

const blobOf = async (url: string | null) => (url ? (await fetch(url)).blob() : null);

/** Local items not yet copied to `account` (0 when there is nothing to move). */
export async function pendingLocalItems(account: string): Promise<number> {
  const map = readMap(account);
  const items = await (await openLocal()).listItems();
  return items.filter((i) => !map[`i:${i.id}`]).length;
}

export async function importLocalInto(target: Repo, account: string, onProgress?: (done: number, total: number) => void) {
  const local = await openLocal();
  const map = readMap(account);
  const save = () => writeMap(account, map);

  // oldest first, so the new created_at order matches the old one
  const items = (await local.listItems()).reverse();
  const [outfits, logs] = await Promise.all([local.listOutfits(), local.listWearLogs()]);
  const total = items.length + outfits.length + logs.length;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  for (const it of items) {
    if (!map[`i:${it.id}`]) {
      const input = toInput(it);
      const image = await blobOf(it.image_url);
      const cut = it.cutout_url ? await blobOf(it.cutout_url) : null;
      const cutout = it.cutout_status ? { blob: cut, status: it.cutout_status } : null;
      const created = await target.createItem(input, image, cutout);
      map[`i:${it.id}`] = created.id;
      save();
    }
    tick();
  }

  const itemId = (id: string) => map[`i:${id}`];
  for (const o of [...outfits].reverse()) {
    if (!map[`o:${o.id}`]) {
      const refs = o.items.filter((r) => itemId(r.wardrobe_item_id)).map((r) => ({ ...r, wardrobe_item_id: itemId(r.wardrobe_item_id) }));
      if (refs.length) {
        const created = await target.createOutfit({
          name: o.name,
          occasion: o.occasion,
          style: o.style,
          source: o.source,
          note: o.note,
          items: refs,
          outfit_date: o.outfit_date,
          render: o.render,
          tryon_key: null, // AI renders are a cache; they are made again on demand
        });
        map[`o:${o.id}`] = created.id;
        save();
      }
    }
    tick();
  }

  for (const l of [...logs].reverse()) {
    if (!map[`l:${l.id}`]) {
      const ids = l.item_ids.map(itemId).filter(Boolean);
      if (ids.length) {
        const created = await target.logWear({ worn_at: l.worn_at, outfit_id: l.outfit_id ? map[`o:${l.outfit_id}`] ?? null : null, item_ids: ids });
        map[`l:${l.id}`] = created.id;
        save();
      }
    }
    tick();
  }

  if (!map.prefs) {
    await target.savePreferences(await local.getPreferences());
    map.prefs = "1";
    save();
  }
  if (!map.person) {
    const p = await local.getPerson("photo");
    if (p) await target.setPerson("photo", await blobOf(p.url));
    map.person = "1";
    save();
  }

  return { items: items.length, outfits: outfits.length, logs: logs.length };
}

function toInput(it: WardrobeItem): NewWardrobeItem {
  const { id: _i, image_url: _u, cutout_url: _c, cutout_status: _s, wear_count: _w, last_worn_at: _l, created_at: _ca, updated_at: _ua, ...input } = it;
  return input;
}
