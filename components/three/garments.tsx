"use client";

import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type BufferGeometry } from "three";
import type { BoneName, Rig } from "@/lib/avatar/rig";
import { BARE, buildGarment, type GarmentPiece, type Surface, type Under } from "@/lib/garments/build";
import { specFor } from "@/lib/garments/templates";
import { colorDef } from "@/lib/taxonomy";
import type { Slot, WardrobeItem } from "@/lib/types";
import type { BoneAttachments } from "./Mannequin3D";

export type Outfit3D = Partial<Record<Slot, WardrobeItem | undefined>>;

// ── fabric ──────────────────────────────────────────────────────

type Fabric = { roughness: number; sheen: number; clearcoat?: number; metalness?: number };
function fabricFor(item: WardrobeItem): Fabric {
  const m = `${item.material ?? ""} ${item.subcategory}`.toLowerCase();
  if (/leather|가죽|레더/.test(m)) return { roughness: 0.45, sheen: 0, clearcoat: 0.35 };
  if (/denim|데님|청/.test(m)) return { roughness: 0.95, sheen: 0.15 };
  if (/nylon|나일론|패딩|바람막이|polyester|폴리/.test(m)) return { roughness: 0.5, sheen: 0.25, clearcoat: 0.15 };
  if (/knit|wool|니트|울|캐시미어|가디건|플리스|fleece/.test(m)) return { roughness: 1, sheen: 0.7 };
  if (/suede|스웨이드/.test(m)) return { roughness: 1, sheen: 0.5 };
  return { roughness: 0.88, sheen: 0.35 }; // cotton-like default
}

/** Procedural print, tiled in metres (UVs are metric), so stripes keep one width everywhere. */
function patternTexture(pattern: string, base: string, accent: string): CanvasTexture | null {
  if (!["stripe", "check", "dot", "camo"].includes(pattern)) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  let period = 0.03; // metres per tile
  if (pattern === "stripe") g.fillRect(0, 0, 128, 44);
  if (pattern === "check") {
    period = 0.06;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, 128, 40);
    g.fillRect(0, 0, 40, 128);
    g.globalAlpha = 0.9;
    g.fillRect(0, 0, 40, 40);
  }
  if (pattern === "dot") {
    period = 0.025;
    g.beginPath();
    g.arc(64, 64, 22, 0, Math.PI * 2);
    g.fill();
  }
  if (pattern === "camo") {
    period = 0.22;
    const tones = [accent, new Color(base).multiplyScalar(0.6).getStyle(), new Color(accent).lerp(new Color(base), 0.5).getStyle()];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = tones[i % 3];
      g.beginPath();
      g.ellipse(rnd() * 128, rnd() * 128, 10 + rnd() * 18, 6 + rnd() * 12, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / period, 1 / period);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function materialsFor(item: WardrobeItem, slot: Slot): Record<Surface, MeshPhysicalMaterial> {
  const base = colorDef(item.color).hex;
  const second = item.secondary_color ? colorDef(item.secondary_color).hex : new Color(base).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? "#2b2b2b" : "#f3f1ec";
  const f = fabricFor(item);
  const map = patternTexture(item.pattern, base, second);
  const main = new MeshPhysicalMaterial({
    color: map ? "#ffffff" : base,
    map,
    roughness: f.roughness,
    sheen: f.sheen,
    sheenRoughness: 0.8,
    sheenColor: new Color(base).lerp(new Color("#ffffff"), 0.5),
    clearcoat: f.clearcoat ?? 0,
    clearcoatRoughness: 0.5,
    side: DoubleSide,
  });
  const trim = new MeshPhysicalMaterial({ color: new Color(base).multiplyScalar(0.55), roughness: 0.6, side: DoubleSide });
  const light = new Color(base).getHSL({ h: 0, s: 0, l: 0 }).l > 0.75;
  const soleColor = slot === "shoes" && /스니커즈|러닝|sneaker/i.test(item.subcategory) ? (light ? "#d9d6cf" : "#f2f0ea") : "#2a2522";
  const sole = new MeshPhysicalMaterial({ color: soleColor, roughness: 0.7 });
  return { main, trim, sole };
}

// ── outfit → bone attachments ───────────────────────────────────

const BUILD_ORDER: Slot[] = ["bottom", "top", "outer", "shoes", "acc"]; // inner → outer

/**
 * Dress the rig: builds every selected garment (each layer offset by what is under it)
 * and returns the meshes grouped per bone for <Mannequin3D attachments>.
 */
export function useGarmentAttachments(rig: Rig, outfit: Outfit3D): BoneAttachments {
  const key = BUILD_ORDER.map((s) => {
    const it = outfit[s];
    return it ? `${it.id}:${it.updated_at}:${it.color}:${it.pattern}:${it.fit}:${it.subcategory}` : "-";
  }).join("|");

  const built = useMemo(() => {
    let under: Under = BARE;
    const out: { slot: Slot; itemId: string; pieces: GarmentPiece[]; mats: Record<Surface, MeshPhysicalMaterial> }[] = [];
    for (const slot of BUILD_ORDER) {
      const it = outfit[slot];
      if (!it) continue;
      const { pieces, next } = buildGarment(rig, specFor(it), under);
      under = next;
      out.push({ slot, itemId: it.id, pieces, mats: materialsFor(it, slot) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, key]);

  useEffect(
    () => () => {
      const geos = new Set<BufferGeometry>();
      for (const b of built) {
        b.pieces.forEach((p) => geos.add(p.geometry));
        Object.values(b.mats).forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      }
      geos.forEach((g) => g.dispose());
    },
    [built],
  );

  return useMemo(() => {
    const byBone: Partial<Record<BoneName, ReactNode[]>> = {};
    for (const b of built)
      b.pieces.forEach((p, i) => {
        (byBone[p.bone] ??= []).push(
          <mesh
            key={`${b.slot}-${b.itemId}-${i}`}
            name={`${b.slot}_${i}`}
            geometry={p.geometry}
            material={b.mats[p.surface]}
            position={p.position}
            rotation={p.rotation}
            scale={p.scale}
            castShadow
            receiveShadow
            dispose={null}
          />,
        );
      });
    const att: BoneAttachments = {};
    for (const [bone, nodes] of Object.entries(byBone) as [BoneName, ReactNode[]][]) att[bone] = <Fragment>{nodes}</Fragment>;
    return att;
  }, [built]);
}
