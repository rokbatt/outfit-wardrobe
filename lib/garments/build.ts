/**
 * Garment template → 3D pieces fitted to a rig.
 *
 * Every garment is the body's own cross-sections pushed outwards by
 *   ease (how loose it is) + the thickness of everything worn underneath,
 * so layers never intersect and every template fits every body. Layering is
 * therefore spatial (BODY < BOTTOM < TOP < OUTER), not a z-index.
 */
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, TorusGeometry } from "three";
import { loftGeometry, resample, type LoftOptions, type Section } from "../avatar/loft";
import type { BoneName, Rig, Vec3 } from "../avatar/rig";
import type { AccSpec, BottomSpec, GarmentSpec, ShoesSpec, TopSpec } from "./templates";

export type Surface = "main" | "trim" | "sole";

export interface GarmentPiece {
  bone: BoneName;
  geometry: BufferGeometry;
  surface: Surface;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

/** How much is already worn underneath (metres), passed from one layer to the next. */
export interface Under {
  torso: number;
  sleeve: number;
  drape: number;
  /** narrowest outline the garment underneath keeps below the chest / along the sleeve */
  torsoFloor?: Required<Section>;
  sleeveFloor?: Required<Section>;
}
export const BARE: Under = { torso: 0, sleeve: 0, drape: 0 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Body section at an arbitrary height, interpolated along the smoothed key sections. */
function sampleAt(keys: Section[], y: number): Required<Section> {
  const d = resample(keys, 8);
  const asc = d[0].y < d[d.length - 1].y;
  const lo = asc ? d[0] : d[d.length - 1];
  const hi = asc ? d[d.length - 1] : d[0];
  if (y <= lo.y) return { ...lo, y };
  if (y >= hi.y) return { ...hi, y };
  for (let i = 0; i < d.length - 1; i++) {
    const a = d[i];
    const b = d[i + 1];
    if ((y - a.y) * (y - b.y) <= 0) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return {
        y,
        rx: lerp(a.rx, b.rx, t),
        rzF: lerp(a.rzF, b.rzF, t),
        rzB: lerp(a.rzB, b.rzB, t),
        x: lerp(a.x, b.x, t),
        z: lerp(a.z, b.z, t),
        n: lerp(a.n, b.n, t),
      };
    }
  }
  return { ...hi, y };
}

const inflate = (s: Required<Section>, e: number): Required<Section> => ({ ...s, rx: s.rx + e, rzF: s.rzF + e, rzB: s.rzB + e });
/** Fabric hangs from its widest point instead of following every concave curve of the body. */
const atLeast = (s: Required<Section>, m: Required<Section>, k: number): Required<Section> => ({
  ...s,
  rx: Math.max(s.rx, m.rx * k),
  rzF: Math.max(s.rzF, m.rzF * k),
  rzB: Math.max(s.rzB, m.rzB * k),
});
const scale = (s: Required<Section>, k: number): Required<Section> => ({ ...s, rx: s.rx * k, rzF: s.rzF * k, rzB: s.rzB * k });
/** Pull a row towards the body (ribbed hem / cuff / waistband). */
const hug = (s: Required<Section>, body: Required<Section>, e: number, t: number): Required<Section> => {
  const snug = inflate(body, e);
  return { ...s, rx: lerp(s.rx, snug.rx, t), rzF: lerp(s.rzF, snug.rzF, t), rzB: lerp(s.rzB, snug.rzB, t) };
};

const CLOTH: LoftOptions = { radial: 64, sub: 6, uvMeters: true };

/** Thin ribbon down the front centre (zip / button placket), following the garment surface. */
function frontLine(rows: Section[]): BufferGeometry {
  const d = resample(rows, 6);
  const w = 0.0045;
  const pos: number[] = [];
  const idx: number[] = [];
  d.forEach((r, i) => {
    const z = r.z + r.rzF + 0.0015;
    pos.push(-w, r.y, z, w, r.y, z);
    if (i) idx.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ring(r: Required<Section>, tube: number, y: number): Omit<GarmentPiece, "bone" | "surface"> {
  const g = new TorusGeometry(r.rx, tube, 12, 64);
  return { geometry: g, position: [0, y, r.z], rotation: [Math.PI / 2, 0, 0], scale: [1, (r.rzF + r.rzB) / 2 / r.rx, 1] };
}

// ── TOP / OUTER ─────────────────────────────────────────────────

function buildTop(rig: Rig, spec: TopSpec, under: Under): { pieces: GarmentPiece[]; next: Under } {
  const L = rig.landmarks;
  const s = rig.params.height / 180;
  const hipsY = rig.bones.Hips.position[1];
  const torso = rig.parts.torso;
  const local = (w: number) => w - hipsY;

  // Loose enough for its own fit, and always clear of whatever is underneath.
  const e = Math.max(spec.ease, under.torso + 0.007 * s);
  const drape = Math.max(spec.drape, under.drape);
  const hemW = spec.hem <= 1 ? lerp(L.waist, L.crotch, spec.hem) : lerp(L.crotch, L.knee, spec.hem - 1);
  const collarL = local(L.neck + 0.002 * s); // base of the neck
  const hemL = local(hemW);
  const hipL = local(L.hip);
  const chestL = local(L.chest);

  // Rows: collar, every body key between, then evenly down to the hem.
  const ys = new Set<number>([collarL, local(L.neck - 0.02 * s), local(L.neck - 0.042 * s)]);
  for (const k of torso) if (k.y < collarL - 0.03 * s && k.y > Math.max(hemL, hipL) + 0.01) ys.add(k.y);
  if (hemL < hipL) {
    const steps = Math.max(1, Math.ceil((hipL - hemL) / (0.08 * s)));
    for (let i = 0; i < steps; i++) ys.add(lerp(hipL, hemL, i / steps));
  }
  ys.add(hemL);
  const levels = [...ys].sort((a, b) => b - a);

  const chest = inflate(sampleAt(torso, chestL), e);
  let rows = levels.map((y, i) => {
    const body = sampleAt(torso, Math.max(y, hipL));
    const row = { ...inflate(body, i === 0 ? 0.005 * s + under.torso * 0.5 : e), y };
    return y < chestL ? atLeast(row, chest, drape) : row;
  });
  if (spec.band) {
    const last = rows.length - 1;
    rows[last] = hug(rows[last], sampleAt(torso, Math.max(hemL, hipL)), under.torso + 0.006 * s, 0.55);
  }
  // Never narrower than a loose garment underneath (e.g. a ribbed hem over an oversized tee).
  if (under.torsoFloor) {
    const floor = inflate(under.torsoFloor, 0.006 * s);
    rows = rows.map((r) => (r.y < chestL ? atLeast(r, floor, 1) : r));
  }
  rows = rows.map((r) => ({ ...r, n: Math.min(r.n, 2.35) })); // cloth rounds off the sculpted squareness

  const pieces: GarmentPiece[] = [{ bone: "Hips", geometry: loftGeometry(rows, CLOTH), surface: "main" }];
  if (spec.frontLine) pieces.push({ bone: "Hips", geometry: frontLine(rows.slice(1)), surface: "trim" });

  // Collar
  const neck = rows[0];
  if (spec.collar === "crew" || spec.collar === "rib") pieces.push({ bone: "Hips", surface: "main", ...ring(neck, (spec.collar === "rib" ? 0.009 : 0.006) * s, neck.y) });
  if (spec.collar === "puffer") pieces.push({ bone: "Hips", surface: "main", ...ring(inflate(neck, 0.012 * s), 0.028 * s, neck.y + 0.005 * s) });
  if (spec.collar === "shirt") {
    const band = [
      { ...inflate(neck, 0.001 * s), y: neck.y - 0.004 * s },
      { ...inflate(neck, 0.004 * s), y: neck.y + 0.022 * s },
      { ...inflate(neck, 0.009 * s), y: neck.y + 0.03 * s },
    ];
    pieces.push({ bone: "Hips", geometry: loftGeometry(band, { radial: 64, sub: 4, uvMeters: true }), surface: "main" });
  }
  if (spec.collar === "hood") {
    // hood lying folded on the upper back
    const g = new TorusGeometry(0.095 * s, 0.03 * s, 14, 48, Math.PI * 1.25);
    pieces.push({
      bone: "Hips",
      geometry: g,
      surface: "main",
      position: [0, neck.y - 0.01 * s, neck.z - neck.rzB * 0.55],
      rotation: [Math.PI / 2 - 0.45, 0, Math.PI * 1.375],
      scale: [1.05, 0.85, 1],
    });
  }

  // Sleeves (one geometry, both arm bones — the arm sections are symmetric)
  let sleeveE = under.sleeve;
  let sleeveFloor = under.sleeveFloor;
  if (spec.sleeve > 0) {
    const arm = rig.parts.arm;
    sleeveE = Math.max(spec.sleeveEase, under.sleeve + 0.006 * s);
    const endY = -L.armLength * spec.sleeve;
    const keys = arm.filter((k) => k.y > endY + 0.02 * s).map((k) => sampleAt(arm, k.y));
    keys.push(sampleAt(arm, endY));
    const top = inflate(keys[0], sleeveE);
    let sl = keys.map((k, i) => (i === 0 ? top : atLeast(inflate(k, sleeveE), top, spec.sleeveDrape)));
    if (spec.cuff) sl[sl.length - 1] = hug(sl[sl.length - 1], keys[keys.length - 1], under.sleeve + 0.006 * s, 0.75);
    if (under.sleeveFloor) {
      const floor = inflate(under.sleeveFloor, 0.005 * s);
      sl = sl.map((r, i) => (i === 0 ? r : atLeast(r, floor, 1)));
    }
    sleeveFloor = scale(top, spec.sleeveDrape);
    sl = sl.map((r) => ({ ...r, n: 2 }));
    const g = loftGeometry(sl, { radial: 40, sub: 6, capStart: 0.034 * s + sleeveE, uvMeters: true });
    pieces.push({ bone: "LeftArm", geometry: g, surface: "main" }, { bone: "RightArm", geometry: g, surface: "main" });
  }

  const torsoFloor = scale(chest, drape);
  return { pieces, next: { torso: e, sleeve: sleeveE, drape, torsoFloor, sleeveFloor } };
}

// ── BOTTOM ──────────────────────────────────────────────────────

function buildBottom(rig: Rig, spec: BottomSpec): { pieces: GarmentPiece[]; next: Under } {
  const L = rig.landmarks;
  const s = rig.params.height / 180;
  const hipsY = rig.bones.Hips.position[1];
  const torso = rig.parts.torso;
  const local = (w: number) => w - hipsY;
  const e = spec.ease;

  const waistL = local(lerp(L.waist, L.hip, spec.rise));
  const hipL = local(L.hip);
  const crotchL = torso[torso.length - 1].y;
  const pieces: GarmentPiece[] = [];

  if (spec.style === "skirt") {
    const hemL = -L.legLength * spec.hem;
    const hip = inflate(sampleAt(torso, hipL), e);
    const rows: Required<Section>[] = [inflate(sampleAt(torso, waistL), e * 0.6), hip];
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const k = 1 + ((spec.flare ?? 1.15) - 1) * t;
      rows.push({ ...hip, y: lerp(hipL, hemL, t), rx: hip.rx * k, rzF: hip.rzF * k, rzB: hip.rzB * k });
    }
    pieces.push({ bone: "Hips", geometry: loftGeometry(rows, CLOTH), surface: "main" });
    return { pieces, next: { torso: e, sleeve: 0, drape: 0 } };
  }

  // Pelvis: waistband → crotch, closed underneath.
  const ys = [waistL, lerp(waistL, hipL, 0.5), hipL, lerp(hipL, crotchL, 0.5), crotchL].filter((y, i, a) => i === 0 || y < a[i - 1] - 0.004);
  const pelvis = ys.map((y, i) => inflate(sampleAt(torso, y), i === 0 ? e * 0.6 : e));
  pieces.push({ bone: "Hips", geometry: loftGeometry(pelvis, { ...CLOTH, capEnd: 0.03 * s + e }), surface: "main" });
  pieces.push({ bone: "Hips", surface: "main", ...ring(pelvis[0], 0.006 * s, pelvis[0].y) }); // waistband edge

  // Legs
  const leg = rig.parts.leg;
  const hemY = -L.legLength * spec.hem;
  const thighY = -0.06 * s;
  const kneeY = L.knee - hipsY;
  const keys = leg.filter((k) => k.y > hemY + 0.02 * s).map((k) => sampleAt(leg, k.y));
  keys.push(sampleAt(leg, Math.max(hemY, leg[leg.length - 1].y)));
  keys[keys.length - 1] = { ...keys[keys.length - 1], y: hemY };
  const thigh = inflate(sampleAt(leg, thighY), e);
  const knee = inflate(sampleAt(leg, kneeY), e);
  let rows = keys.map((k) => {
    let r = inflate(k, e);
    if (k.y < thighY) {
      if (spec.leg === "wide") r = atLeast(r, thigh, 0.97);
      if (spec.leg === "straight" && k.y < kneeY) r = atLeast(r, { ...knee, rx: knee.rx + 0.01 * s, rzF: knee.rzF + 0.01 * s, rzB: knee.rzB + 0.01 * s }, 1);
      if (spec.leg === "straight" && k.y >= kneeY) r = atLeast(r, knee, 1.08);
    }
    return { ...r, n: 2 };
  });
  if (spec.cuff) rows[rows.length - 1] = hug(rows[rows.length - 1], keys[keys.length - 1], 0.005 * s, 0.75);
  rows = rows.filter((r, i, a) => i === 0 || r.y < a[i - 1].y - 0.002);
  const lg = loftGeometry(rows, CLOTH);
  pieces.push({ bone: "LeftUpLeg", geometry: lg, surface: "main" }, { bone: "RightUpLeg", geometry: lg, surface: "main" });

  return { pieces, next: { torso: e, sleeve: 0, drape: 0 } };
}

// ── SHOES ───────────────────────────────────────────────────────

function buildShoes(rig: Rig, spec: ShoesSpec): GarmentPiece[] {
  const s = rig.params.height / 180;
  const foot = rig.parts.foot.map((f) => sampleAt(rig.parts.foot, f.y));
  const pieces: GarmentPiece[] = [];
  const both = (g: BufferGeometry, surface: Surface, bone: "Foot" | "UpLeg" = "Foot") =>
    pieces.push({ bone: `Left${bone}` as BoneName, geometry: g, surface }, { bone: `Right${bone}` as BoneName, geometry: g, surface });

  const soleUp = spec.style === "sneaker" ? 0.006 * s : 0.001 * s;
  const soleDown = spec.style === "sneaker" ? 0.014 * s : 0.009 * s;
  const sole = foot.map((f) => ({ ...f, rx: f.rx + 0.009 * s, rzF: f.rzF + soleDown, rzB: soleUp, n: 2.4 }));
  both(loftGeometry(sole, { radial: 48, sub: 6, capStart: 0.028 * s, capEnd: 0.028 * s }), "sole");

  if (spec.style !== "sandal") {
    const e = (spec.style === "boots" ? 0.009 : 0.006) * s;
    const upper = foot.map((f) => ({ ...inflate(f, e), n: 2.2 }));
    both(loftGeometry(upper, { radial: 48, sub: 6, capStart: 0.02 * s + e, capEnd: 0.018 * s + e, uvMeters: true }), "main");
  } else {
    const strap = [0.02, 0.045].map((y) => ({ ...inflate(sampleAt(rig.parts.foot, y * s), 0.003 * s), n: 2 }));
    both(loftGeometry(strap, { radial: 40, sub: 2, uvMeters: true }), "main");
  }

  if (spec.style === "boots") {
    const leg = rig.parts.leg;
    const bottom = -rig.landmarks.legLength;
    const rows = [0.2, 0.13, 0.06, 0].map((t) => ({ ...inflate(sampleAt(leg, bottom + t * s), 0.013 * s), n: 2 }));
    both(loftGeometry(rows, { radial: 40, sub: 4, uvMeters: true }), "main", "UpLeg");
  }
  return pieces;
}

// ── ACCESSORIES ─────────────────────────────────────────────────

function buildAcc(rig: Rig, spec: AccSpec): GarmentPiece[] {
  if (spec.style === "none") return [];
  const s = rig.params.height / 180;
  const head = rig.parts.head;
  const top = head[head.length - 1].y;
  if (spec.style === "beanie") {
    const from = 0.09 * s;
    const rows = [from, from + 0.025 * s, ...head.filter((h) => h.y > from + 0.03 * s).map((h) => h.y)].map((y, i) => ({
      ...inflate(sampleAt(head, y), (i < 2 ? 0.018 : 0.012) * s),
      n: 2,
    }));
    return [{ bone: "Head", geometry: loftGeometry(rows, { radial: 56, sub: 6, capEnd: 0.03 * s, uvMeters: true }), surface: "main" }];
  }
  // cap: crown + front brim
  const brimY = 0.108 * s;
  const rows = [brimY, ...head.filter((h) => h.y > brimY + 0.01 * s).map((h) => h.y), top].map((y) => ({ ...inflate(sampleAt(head, y), 0.009 * s), n: 2 }));
  const base = rows[0];
  const brim = new CylinderGeometry(0.078 * s, 0.078 * s, 0.005 * s, 40, 1, false, -Math.PI / 2, Math.PI);
  return [
    { bone: "Head", geometry: loftGeometry(rows, { radial: 56, sub: 6, capEnd: 0.03 * s, uvMeters: true }), surface: "main" },
    { bone: "Head", geometry: brim, surface: "main", position: [0, brimY, base.z + base.rzF - 0.035 * s], rotation: [0.14, 0, 0], scale: [0.95, 1, 1.15] },
  ];
}

export function buildGarment(rig: Rig, spec: GarmentSpec, under: Under = BARE): { pieces: GarmentPiece[]; next: Under } {
  switch (spec.kind) {
    case "top":
      return buildTop(rig, spec, under);
    case "bottom":
      return buildBottom(rig, spec);
    case "shoes":
      return { pieces: buildShoes(rig, spec), next: under };
    case "acc":
      return { pieces: buildAcc(rig, spec), next: under };
  }
}
