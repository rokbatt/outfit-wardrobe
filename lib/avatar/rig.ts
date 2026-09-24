/**
 * Mannequin rig: body params → bone transforms + body-part cross-sections + sculpt detail.
 *
 * Bone names follow the Mixamo convention (Hips, Spine, Chest, Neck, Head, LeftArm, …)
 * so a skinned GLB avatar can replace the procedural one later and garments keep
 * attaching to the same bones. Garment templates read `parts` and `landmarks`
 * to build geometry that fits this exact body.
 *
 * Units: metres. Floor at y = 0, body faces +Z. "Left" is the mannequin's own left (+X).
 */
import type { BodyParams } from "./body";
import type { Bump, Section } from "./loft";

export type BoneName =
  | "Hips"
  | "Spine"
  | "Chest"
  | "Neck"
  | "Head"
  | "LeftArm"
  | "LeftHand"
  | "RightArm"
  | "RightHand"
  | "LeftUpLeg"
  | "LeftFoot"
  | "RightUpLeg"
  | "RightFoot";

export type Vec3 = [number, number, number];

export interface Bone {
  parent: BoneName | null;
  /** position relative to the parent bone */
  position: Vec3;
  rotation: Vec3;
}

/** Cross-sections of each rigid body part, in its bone's local space. */
export interface BodyParts {
  torso: Section[]; // Hips
  head: Section[]; // Head
  arm: Section[]; // LeftArm / RightArm (symmetric, mirrored by bone rotation)
  hand: Section[]; // LeftHand / RightHand
  thumb: Section[]; // child of each hand
  leg: Section[]; // LeftUpLeg / RightUpLeg
  foot: Section[]; // LeftFoot / RightFoot (axis along +Z via bone rotation)
}

/** Sculpted surface detail per part, same local space as the sections. */
export type BodyDetail = Record<"torso" | "head" | "arm" | "hand" | "leg", Bump[]>;

/** World-space heights used to size garments (hem at mid-hip, sleeve to wrist, …). */
export interface Landmarks {
  top: number;
  neck: number;
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  crotch: number;
  knee: number;
  ankle: number;
  /** half width across the shoulder joints */
  shoulderHalf: number;
  /** x of each hip joint */
  hipHalf: number;
  armLength: number;
  legLength: number;
}

export interface Rig {
  params: BodyParams;
  bones: Record<BoneName, Bone>;
  parts: BodyParts;
  detail: BodyDetail;
  landmarks: Landmarks;
}

// ── Neutral 180 cm fashion mannequin (≈ 8.5 heads, long legs), world heights ──
const REF_H = 1.8;
const Y = {
  ankle: 0.075,
  knee: 0.5,
  crotch: 0.875,
  hipJoint: 0.935,
  hip: 0.965,
  waist: 1.14,
  chest: 1.325,
  shoulder: 1.445,
  neck: 1.515,
  chin: 1.588,
  top: 1.8,
};

// Torso key sections (world y at 180 cm). n > 2 squares off chest and shoulders.
const TORSO: Section[] = [
  { y: 1.63, rx: 0.046, rzF: 0.05, rzB: 0.05, z: -0.008 },
  { y: 1.56, rx: 0.054, rzF: 0.054, rzB: 0.056, z: -0.01 },
  { y: 1.52, rx: 0.07, rzF: 0.062, rzB: 0.066, z: -0.014, n: 2.2 },
  { y: 1.49, rx: 0.15, rzF: 0.075, rzB: 0.082, z: -0.014, n: 2.7 },
  { y: 1.455, rx: 0.196, rzF: 0.09, rzB: 0.092, z: -0.008, n: 3.2 },
  { y: 1.39, rx: 0.186, rzF: 0.112, rzB: 0.098, n: 3.0 },
  { y: 1.31, rx: 0.168, rzF: 0.114, rzB: 0.097, n: 2.7 },
  { y: 1.22, rx: 0.147, rzF: 0.1, rzB: 0.088, n: 2.4 },
  { y: 1.14, rx: 0.133, rzF: 0.09, rzB: 0.085, n: 2.3 },
  { y: 1.05, rx: 0.147, rzF: 0.092, rzB: 0.095, n: 2.4 },
  { y: 0.965, rx: 0.162, rzF: 0.095, rzB: 0.112, z: -0.005, n: 2.5 },
  { y: 0.915, rx: 0.157, rzF: 0.088, rzB: 0.108, z: -0.01, n: 2.4 },
  { y: 0.875, rx: 0.114, rzF: 0.068, rzB: 0.076, z: -0.01, n: 2.2 },
];

// Sculpted anatomy (world y at 180 cm) — what turns a tube into a display mannequin.
const TORSO_DETAIL: Bump[] = [
  { face: "F", a: 0.07, y: 1.335, sa: 0.05, sy: 0.038, amt: 0.012, mirror: true }, // pectorals
  { face: "F", a: 0.07, y: 1.288, sa: 0.052, sy: 0.011, amt: -0.004, mirror: true }, // lower pec edge
  { face: "F", a: 0, y: 1.32, sa: 0.012, sy: 0.06, amt: -0.004 }, // sternum
  { face: "F", a: 0.07, y: 1.485, sa: 0.055, sy: 0.011, amt: 0.004, mirror: true }, // clavicles
  { face: "F", a: 0, y: 1.553, sa: 0.01, sy: 0.012, amt: 0.003 }, // throat
  { face: "F", a: 0.033, y: 1.225, sa: 0.026, sy: 0.02, amt: 0.004, mirror: true }, // abdominals
  { face: "F", a: 0.033, y: 1.175, sa: 0.026, sy: 0.02, amt: 0.004, mirror: true },
  { face: "F", a: 0.032, y: 1.125, sa: 0.026, sy: 0.02, amt: 0.0035, mirror: true },
  { face: "F", a: 0, y: 1.17, sa: 0.008, sy: 0.08, amt: -0.003 }, // linea alba
  { face: "F", a: 0, y: 1.095, sa: 0.007, sy: 0.007, amt: -0.004 }, // navel
  { face: "F", a: 0.085, y: 1.03, sa: 0.01, sy: 0.05, amt: -0.003, mirror: true }, // iliac line
  { face: "B", a: 0.085, y: 1.39, sa: 0.045, sy: 0.055, amt: 0.008, mirror: true }, // shoulder blades
  { face: "B", a: 0, y: 1.25, sa: 0.011, sy: 0.18, amt: -0.006 }, // spine
  { face: "B", a: 0.075, y: 0.945, sa: 0.06, sy: 0.055, amt: 0.014, mirror: true }, // glutes
  { face: "B", a: 0.075, y: 0.897, sa: 0.06, sy: 0.012, amt: -0.004, mirror: true }, // gluteal fold
];

// Abstract head with a quiet face plane (Head-local: y = 0 at the chin).
const HEAD: Section[] = [
  { y: 0, rx: 0.034, rzF: 0.034, rzB: 0.03, z: 0.02 },
  { y: 0.025, rx: 0.056, rzF: 0.064, rzB: 0.054, z: 0.01 },
  { y: 0.068, rx: 0.07, rzF: 0.082, rzB: 0.082 },
  { y: 0.12, rx: 0.077, rzF: 0.088, rzB: 0.096, z: -0.006 },
  { y: 0.163, rx: 0.072, rzF: 0.08, rzB: 0.09, z: -0.01 },
  { y: 0.195, rx: 0.048, rzF: 0.053, rzB: 0.058, z: -0.012 },
];
const HEAD_DETAIL: Bump[] = [
  { face: "F", a: 0, y: 0.07, sa: 0.011, sy: 0.026, amt: 0.011 }, // nose
  { face: "F", a: 0, y: 0.052, sa: 0.012, sy: 0.01, amt: 0.004 }, // nose tip
  { face: "F", a: 0.028, y: 0.105, sa: 0.03, sy: 0.01, amt: 0.005, mirror: true }, // brow
  { face: "F", a: 0.03, y: 0.088, sa: 0.016, sy: 0.011, amt: -0.006, mirror: true }, // eye sockets
  { face: "F", a: 0.05, y: 0.06, sa: 0.022, sy: 0.02, amt: 0.003, mirror: true }, // cheekbones
  { face: "F", a: 0, y: 0.036, sa: 0.016, sy: 0.006, amt: 0.003 }, // lips
  { face: "F", a: 0, y: 0.012, sa: 0.02, sy: 0.012, amt: 0.005 }, // chin
  { face: "S", a: -0.006, y: 0.085, sa: 0.018, sy: 0.028, amt: 0.008 }, // ears
];

// Whole arm from the shoulder joint down to the wrist, a gentle forward bend at the elbow.
const ARM: Section[] = [
  { y: 0.01, rx: 0.048, rzF: 0.05, rzB: 0.05 },
  { y: -0.063, rx: 0.045, rzF: 0.047, rzB: 0.047 },
  { y: -0.168, rx: 0.04, rzF: 0.043, rzB: 0.041 },
  { y: -0.29, rx: 0.033, rzF: 0.035, rzB: 0.035, z: 0.004 },
  { y: -0.345, rx: 0.034, rzF: 0.037, rzB: 0.034, z: 0.012 },
  { y: -0.45, rx: 0.028, rzF: 0.032, rzB: 0.028, z: 0.025 },
  { y: -0.56, rx: 0.021, rzF: 0.025, rzB: 0.024, z: 0.034 },
];
const ARM_DETAIL: Bump[] = [
  { face: "F", a: 0, y: -0.16, sa: 0.03, sy: 0.06, amt: 0.004 }, // biceps
  { face: "B", a: 0, y: -0.3, sa: 0.02, sy: 0.02, amt: 0.005 }, // elbow
  { face: "S", a: 0, y: -0.03, sa: 0.04, sy: 0.05, amt: 0.004 }, // deltoid
];
const WRIST: Vec3 = [0, -0.565, 0.034];

// Hand, palm facing the thigh (thin in X, wide in Z), fingers together with sculpted gaps.
const HAND: Section[] = [
  { y: 0.01, rx: 0.018, rzF: 0.026, rzB: 0.026 },
  { y: -0.035, rx: 0.021, rzF: 0.041, rzB: 0.038 },
  { y: -0.085, rx: 0.018, rzF: 0.043, rzB: 0.037, z: 0.003 },
  { y: -0.135, rx: 0.013, rzF: 0.035, rzB: 0.028, z: 0.007 },
  { y: -0.168, rx: 0.009, rzF: 0.019, rzB: 0.017, z: 0.01 },
];
const HAND_DETAIL: Bump[] = [-0.016, 0.004, 0.022].map((z) => ({ face: "A" as const, a: z, y: -0.135, sa: 0.0028, sy: 0.04, amt: -0.0025 }));
const THUMB: Section[] = [
  { y: 0, rx: 0.012, rzF: 0.013, rzB: 0.013 },
  { y: -0.035, rx: 0.011, rzF: 0.011, rzB: 0.011 },
  { y: -0.06, rx: 0.009, rzF: 0.009, rzB: 0.009 },
];

// Whole leg from the hip joint to the ankle; calf sits slightly behind the shin line.
const LEG: Section[] = [
  { y: 0.07, rx: 0.05, rzF: 0.058, rzB: 0.062 },
  { y: 0.02, rx: 0.074, rzF: 0.084, rzB: 0.09 },
  { y: -0.06, rx: 0.086, rzF: 0.09, rzB: 0.094, n: 2.2 },
  { y: -0.21, rx: 0.073, rzF: 0.077, rzB: 0.075 },
  { y: -0.38, rx: 0.055, rzF: 0.058, rzB: 0.057 },
  { y: -0.43, rx: 0.05, rzF: 0.054, rzB: 0.053, z: 0.002 },
  { y: -0.51, rx: 0.051, rzF: 0.048, rzB: 0.064, z: -0.004 },
  { y: -0.59, rx: 0.05, rzF: 0.044, rzB: 0.062, z: -0.006 },
  { y: -0.72, rx: 0.034, rzF: 0.034, rzB: 0.042, z: -0.004 },
  { y: -0.835, rx: 0.026, rzF: 0.028, rzB: 0.03 },
  { y: -0.86, rx: 0.027, rzF: 0.029, rzB: 0.031 },
];
const LEG_DETAIL: Bump[] = [
  { face: "F", a: 0, y: -0.22, sa: 0.05, sy: 0.08, amt: 0.004 }, // quadriceps
  { face: "F", a: 0, y: -0.43, sa: 0.026, sy: 0.03, amt: 0.007 }, // kneecap
  { face: "F", a: 0, y: -0.467, sa: 0.025, sy: 0.009, amt: -0.002 },
  { face: "B", a: 0, y: -0.56, sa: 0.04, sy: 0.07, amt: 0.005 }, // calf
  { face: "S", a: 0, y: -0.84, sa: 0.012, sy: 0.012, amt: 0.004 }, // ankle bones
];

// Foot, built along local Y (heel → toe) and turned to point forward by the bone.
// Local +Z becomes world −Y, so rzF is the sole side and rzB the instep.
const FOOT: Section[] = [
  { y: -0.055, rx: 0.027, rzF: 0.026, rzB: 0.03, z: 0.049 },
  { y: -0.02, rx: 0.033, rzF: 0.03, rzB: 0.048, z: 0.047 },
  { y: 0.04, rx: 0.036, rzF: 0.029, rzB: 0.04, z: 0.05 },
  { y: 0.1, rx: 0.039, rzF: 0.026, rzB: 0.027, z: 0.054 },
  { y: 0.155, rx: 0.038, rzF: 0.024, rzB: 0.017, z: 0.056 },
  { y: 0.19, rx: 0.033, rzF: 0.02, rzB: 0.011, z: 0.058 },
];

const ARM_SPREAD = (8 * Math.PI) / 180; // relaxed A-pose, room for sleeves and outerwear
const LEG_SPREAD = (1.6 * Math.PI) / 180;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise-linear width multiplier along the body, from the per-region params. */
function widthCurve(p: BodyParams) {
  const pts: [number, number][] = [
    [1.8, 1],
    [1.53, 1],
    [Y.shoulder, p.shoulder],
    [Y.chest, p.chest],
    [Y.waist, p.waist],
    [Y.hip, p.hip],
    [0, p.hip],
  ];
  return (y: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [y0, v0] = pts[i];
      const [y1, v1] = pts[i + 1];
      if (y <= y0 && y >= y1) return lerp(v0, v1, (y0 - y) / (y0 - y1 || 1));
    }
    return 1;
  };
}

type Scale = { y: number; w: number; d?: number; yOffset?: number };
const scaleSections = (list: Section[], k: Scale): Section[] =>
  list.map((s) => ({
    ...s,
    y: s.y * k.y + (k.yOffset ?? 0),
    rx: s.rx * k.w,
    rzF: s.rzF * (k.d ?? k.w),
    rzB: s.rzB * (k.d ?? k.w),
    x: (s.x ?? 0) * k.w,
    z: (s.z ?? 0) * (k.d ?? k.w),
  }));
const scaleBumps = (list: Bump[], ky: number, kw: number): Bump[] =>
  list.map((b) => ({ ...b, y: b.y * ky, a: b.a * kw, sa: b.sa * kw, sy: b.sy * ky, amt: b.amt * kw }));

export function buildRig(params: BodyParams): Rig {
  const sv = params.height / 100 / REF_H;
  const lr = params.legRatio;
  const H = REF_H;
  // Leg length scales by legRatio; everything above the hip joint compresses/stretches to keep stature.
  const above = (H - Y.hipJoint * lr) / (H - Y.hipJoint);
  const toY = (y: number) => sv * (y <= Y.hipJoint ? y * lr : Y.hipJoint * lr + (y - Y.hipJoint) * above);
  const wf = widthCurve(params);
  const depth = (w: number) => 1 + (w - 1) * 0.8;

  const hipsY = toY(Y.hipJoint);
  const torso = TORSO.map((s) => {
    const w = wf(s.y);
    return { ...s, y: toY(s.y) - hipsY, rx: s.rx * w * sv, rzF: s.rzF * depth(w) * sv, rzB: s.rzB * depth(w) * sv, z: (s.z ?? 0) * sv };
  });
  const torsoDetail = TORSO_DETAIL.map((b) => {
    const w = wf(b.y);
    return { ...b, y: toY(b.y) - hipsY, a: b.a * sv * w, sa: b.sa * sv * w, sy: b.sy * sv * above, amt: b.amt * sv };
  });

  const vs = sv * above; // vertical scale above the hips
  const armW = sv * (1 + (params.chest - 1) * 0.6);
  const legW = sv * (1 + (params.hip - 1) * 0.7);

  const shoulderHalf = 0.19 * sv * params.shoulder;
  const hipHalf = 0.086 * sv * lerp(1, params.hip, 0.8);
  const waistY = toY(Y.waist);
  const chestY = toY(Y.chest);
  const neckY = toY(Y.neck);
  const shoulderY = toY(Y.shoulder);
  const chinY = toY(Y.chin);
  const legLen = (Y.hipJoint - Y.ankle) * sv * lr;

  const bones: Record<BoneName, Bone> = {
    Hips: { parent: null, position: [0, hipsY, 0], rotation: [0, 0, 0] },
    Spine: { parent: "Hips", position: [0, waistY - hipsY, 0], rotation: [0, 0, 0] },
    Chest: { parent: "Spine", position: [0, chestY - waistY, 0], rotation: [0, 0, 0] },
    Neck: { parent: "Chest", position: [0, neckY - chestY, -0.012 * sv], rotation: [0, 0, 0] },
    Head: { parent: "Neck", position: [0, chinY - neckY, 0.004 * sv], rotation: [0, 0, 0] },
    LeftArm: { parent: "Chest", position: [shoulderHalf, shoulderY - chestY - 0.014 * sv, -0.008 * sv], rotation: [0, 0, ARM_SPREAD] },
    RightArm: { parent: "Chest", position: [-shoulderHalf, shoulderY - chestY - 0.014 * sv, -0.008 * sv], rotation: [0, 0, -ARM_SPREAD] },
    LeftHand: { parent: "LeftArm", position: [WRIST[0], WRIST[1] * vs, WRIST[2] * sv], rotation: [0.06, 0, -0.05] },
    RightHand: { parent: "RightArm", position: [WRIST[0], WRIST[1] * vs, WRIST[2] * sv], rotation: [0.06, 0, 0.05] },
    LeftUpLeg: { parent: "Hips", position: [hipHalf, 0, 0], rotation: [0, 0, LEG_SPREAD] },
    RightUpLeg: { parent: "Hips", position: [-hipHalf, 0, 0], rotation: [0, 0, -LEG_SPREAD] },
    // Foot bone at the ankle, turned so its local +Y points forward (+Z) and local +Z down.
    LeftFoot: { parent: "LeftUpLeg", position: [0, -legLen, 0], rotation: [Math.PI / 2, 0, 0] },
    RightFoot: { parent: "RightUpLeg", position: [0, -legLen, 0], rotation: [Math.PI / 2, 0, 0] },
  };

  return {
    params,
    bones,
    parts: {
      torso,
      head: scaleSections(HEAD, { y: vs, w: sv }),
      arm: scaleSections(ARM, { y: vs, w: armW }),
      hand: scaleSections(HAND, { y: sv, w: sv }),
      thumb: scaleSections(THUMB, { y: sv, w: sv }),
      leg: scaleSections(LEG, { y: sv * lr, w: legW }),
      foot: scaleSections(FOOT, { y: sv, w: sv }),
    },
    detail: {
      torso: torsoDetail,
      head: scaleBumps(HEAD_DETAIL, vs, sv),
      arm: scaleBumps(ARM_DETAIL, vs, armW),
      hand: scaleBumps(HAND_DETAIL, sv, sv),
      leg: scaleBumps(LEG_DETAIL, sv * lr, legW),
    },
    landmarks: {
      top: toY(Y.top),
      neck: neckY,
      shoulder: shoulderY,
      chest: chestY,
      waist: waistY,
      hip: toY(Y.hip),
      crotch: toY(Y.crotch),
      knee: toY(Y.knee),
      ankle: toY(Y.ankle),
      shoulderHalf,
      hipHalf,
      armLength: -WRIST[1] * vs,
      legLength: legLen,
    },
  };
}
