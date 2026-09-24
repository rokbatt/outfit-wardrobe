/**
 * Loft geometry: a smooth tube swept through cross-sections.
 *
 * The avatar body is built from this, and garment templates (Phase 2) will be too —
 * a garment is the same section list inflated by ease + fabric thickness, so it
 * always follows the body it is worn on.
 *
 * Cross-sections are super-ellipses in the local XZ plane, stacked along local Y.
 * +Z is the front of the body, so front/back depth can differ (chest vs. back, belly vs. seat).
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

export interface Section {
  /** position along the tube axis (local Y) */
  y: number;
  /** half width (X) */
  rx: number;
  /** half depth towards the front (+Z) */
  rzF: number;
  /** half depth towards the back (−Z) */
  rzB: number;
  /** centre offset */
  x?: number;
  z?: number;
  /** super-ellipse exponent: 2 = ellipse, higher = squarer */
  n?: number;
}

export interface LoftOptions {
  radial?: number; // vertices around
  sub?: number; // interpolated rings between two key sections
  capStart?: number; // rounded cap height at the first section (0 = open)
  capEnd?: number; // rounded cap height at the last section
  /** UVs in metres (u around, v along) so fabric patterns keep one scale across pieces */
  uvMeters?: boolean;
  /** sculpted surface detail, in the same local space as the sections */
  bumps?: Bump[];
}

type Num = Exclude<keyof Section, never>;
const KEYS: Num[] = ["y", "rx", "rzF", "rzB", "x", "z", "n"];

const full = (s: Section): Required<Section> => ({ x: 0, z: 0, n: 2, ...s });

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smoothly resample key sections (Catmull-Rom on every property). */
export function resample(keys: Section[], sub: number): Required<Section>[] {
  const s = keys.map(full);
  if (s.length < 2) return s;
  const out: Required<Section>[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    const p0 = s[i - 1] ?? s[i];
    const p1 = s[i];
    const p2 = s[i + 1];
    const p3 = s[i + 2] ?? s[i + 1];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const r = {} as Required<Section>;
      for (const key of KEYS) r[key] = catmull(p0[key], p1[key], p2[key], p3[key], t);
      // radii never go negative from spline overshoot
      r.rx = Math.max(r.rx, 1e-4);
      r.rzF = Math.max(r.rzF, 1e-4);
      r.rzB = Math.max(r.rzB, 1e-4);
      out.push(r);
    }
  }
  out.push(s[s.length - 1]);
  return out;
}

/** Rounded end: shrink the end section along a quarter circle. */
function cap(end: Required<Section>, dir: number, h: number, steps = 6): Required<Section>[] {
  const out: Required<Section>[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    const k = Math.max(Math.cos(a), 0.002);
    out.push({ ...end, y: end.y + dir * h * Math.sin(a), rx: end.rx * k, rzF: end.rzF * k, rzB: end.rzB * k });
  }
  return out;
}

const spow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;

export function loftGeometry(keys: Section[], opts: LoftOptions = {}): BufferGeometry {
  const radial = opts.radial ?? 48;
  let rings = resample(keys, opts.sub ?? 6);
  if (opts.capStart) {
    const dir = Math.sign(rings[0].y - rings[1].y) || -1;
    rings = [...cap(rings[0], dir, opts.capStart).reverse(), ...rings];
  }
  if (opts.capEnd) {
    const n = rings.length;
    const dir = Math.sign(rings[n - 1].y - rings[n - 2].y) || 1;
    rings = [...rings, ...cap(rings[n - 1], dir, opts.capEnd)];
  }

  // v coordinate: arc length along the axis (for fabric textures in Phase 2)
  const len = [0];
  for (let i = 1; i < rings.length; i++) len.push(len[i - 1] + Math.abs(rings[i].y - rings[i - 1].y) + 1e-6);
  const total = len[len.length - 1];

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cols = radial + 1; // duplicated seam column for clean UVs

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const e = 2 / r.n;
    // Ramanujan's ellipse perimeter — close enough for texture scale
    const a = r.rx;
    const b = (r.rzF + r.rzB) / 2;
    const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    for (let j = 0; j <= radial; j++) {
      // θ = 0 at the back centre so the UV seam hides at the back
      const th = (j / radial) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(r.x + r.rx * spow(c, e), r.y, r.z + (s >= 0 ? r.rzF : r.rzB) * spow(s, e));
      if (opts.uvMeters) uv.push((j / radial) * perim, len[i]);
      else uv.push(j / radial, len[i] / total);
    }
  }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }

  // Make the winding face outwards regardless of axis direction.
  const mid = Math.floor(rings.length / 2);
  const a = mid * cols;
  const P = (k: number) => new Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const n = P(a + cols).sub(P(a)).cross(P(a + 1).sub(P(a)));
  const out = P(a).sub(new Vector3(rings[mid].x, rings[mid].y, rings[mid].z));
  if (n.dot(out) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g, rings.length, cols);
  if (opts.bumps?.length) {
    sculpt(g, opts.bumps);
    smoothNormals(g, rings.length, cols);
  }
  g.computeBoundingSphere();
  return g;
}

/** Vertex normals, welded across the UV seam so the back shows no crease. */
function smoothNormals(g: BufferGeometry, rows: number, cols: number) {
  g.computeVertexNormals();
  const nor = g.getAttribute("normal") as Float32BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < rows; i++) {
    const p = i * cols;
    const q = p + cols - 1;
    v.set(nor.getX(p) + nor.getX(q), nor.getY(p) + nor.getY(q), nor.getZ(p) + nor.getZ(q)).normalize();
    nor.setXYZ(p, v.x, v.y, v.z);
    nor.setXYZ(q, v.x, v.y, v.z);
  }
}

// ── Sculpting ────────────────────────────────────────────────────

/**
 * A soft bump (amt > 0) or groove (amt < 0) pushed along the surface normal.
 *   face "F" / "B": on the front / back surface, centred at (a = x, y), size (sa = x-radius, sy)
 *   face "S":       on the outer sides (±x), centred at (a = z, y)
 *   face "A":       any surface, centred at (a = z, y) — e.g. finger grooves through a flat hand
 * mirror: also at −a (F/B: the other side of the body).
 */
export interface Bump {
  face: "F" | "B" | "S" | "A";
  a: number;
  y: number;
  sa: number;
  sy: number;
  amt: number;
  mirror?: boolean;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function sculpt(g: BufferGeometry, bumps: Bump[]) {
  const pos = g.getAttribute("position") as Float32BufferAttribute;
  const nor = g.getAttribute("normal") as Float32BufferAttribute;
  const list = bumps.flatMap((b) => (b.mirror && b.a !== 0 ? [b, { ...b, a: -b.a }] : [b]));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    let d = 0;
    for (const b of list) {
      const dy = (y - b.y) / b.sy;
      if (dy * dy > 9) continue;
      let du: number;
      let mask: number;
      if (b.face === "F" || b.face === "B") {
        du = (x - b.a) / b.sa;
        mask = smooth(0.15, 0.75, b.face === "F" ? nz : -nz);
      } else {
        du = (z - b.a) / b.sa;
        mask = b.face === "S" ? smooth(0.2, 0.8, Math.abs(nx)) : 1;
      }
      d += b.amt * Math.exp(-(du * du + dy * dy)) * mask;
    }
    if (d) pos.setXYZ(i, x + nx * d, y + ny * d, z + nz * d);
  }
  pos.needsUpdate = true;
}
