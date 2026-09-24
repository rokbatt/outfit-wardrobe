"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { MeshPhysicalMaterial, MeshStandardMaterial, type BufferGeometry } from "three";
import { loftGeometry } from "@/lib/avatar/loft";
import type { BoneName, Rig } from "@/lib/avatar/rig";

/** Anything placed here is parented to that bone (garments, accessories). */
export type BoneAttachments = Partial<Record<BoneName, ReactNode>>;

const CHILDREN: Record<BoneName, BoneName[]> = {
  Hips: ["Spine", "LeftUpLeg", "RightUpLeg"],
  Spine: ["Chest"],
  Chest: ["Neck", "LeftArm", "RightArm"],
  Neck: ["Head"],
  Head: [],
  LeftArm: ["LeftHand"],
  RightArm: ["RightHand"],
  LeftHand: [],
  RightHand: [],
  LeftUpLeg: ["LeftFoot"],
  RightUpLeg: ["RightFoot"],
  LeftFoot: [],
  RightFoot: [],
};

type PartKey = "torso" | "head" | "arm" | "hand" | "thumb" | "leg" | "foot";
const PART_OF: Partial<Record<BoneName, PartKey>> = {
  Hips: "torso",
  Head: "head",
  LeftArm: "arm",
  RightArm: "arm",
  LeftHand: "hand",
  RightHand: "hand",
  LeftUpLeg: "leg",
  RightUpLeg: "leg",
  LeftFoot: "foot",
  RightFoot: "foot",
};

function useBodyGeometry(rig: Rig): Record<PartKey, BufferGeometry> {
  const geo = useMemo(() => {
    const p = rig.parts;
    const d = rig.detail;
    return {
      torso: loftGeometry(p.torso, { radial: 112, sub: 12, capStart: 0.012, capEnd: 0.03, bumps: d.torso }),
      head: loftGeometry(p.head, { radial: 80, sub: 12, capStart: 0.022, capEnd: 0.018, bumps: d.head }),
      arm: loftGeometry(p.arm, { radial: 56, sub: 9, capStart: 0.034, capEnd: 0.012, bumps: d.arm }),
      hand: loftGeometry(p.hand, { radial: 48, sub: 8, capStart: 0.008, capEnd: 0.012, bumps: d.hand }),
      thumb: loftGeometry(p.thumb, { radial: 20, sub: 5, capStart: 0.006, capEnd: 0.008 }),
      leg: loftGeometry(p.leg, { radial: 64, sub: 10, capStart: 0.03, capEnd: 0.01, bumps: d.leg }),
      foot: loftGeometry(p.foot, { radial: 48, sub: 8, capStart: 0.02, capEnd: 0.018 }),
    };
  }, [rig]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return geo;
}

function BoneNode({
  name,
  rig,
  geo,
  material,
  attachments,
}: {
  name: BoneName;
  rig: Rig;
  geo: Record<PartKey, BufferGeometry>;
  material: MeshPhysicalMaterial;
  attachments?: BoneAttachments;
}) {
  const b = rig.bones[name];
  const part = PART_OF[name];
  const s = rig.params.height / 180;
  return (
    <group name={name} position={b.position} rotation={b.rotation}>
      {part && <mesh name={`${name}_body`} geometry={geo[part]} material={material} castShadow receiveShadow dispose={null} />}
      {part === "hand" && (
        // thumb along the front edge, angled forward and in
        <mesh geometry={geo.thumb} material={material} position={[0, -0.028 * s, 0.03 * s]} rotation={[-0.5, 0, 0]} castShadow dispose={null} />
      )}
      {attachments?.[name]}
      {CHILDREN[name].map((c) => (
        <BoneNode key={c} name={c} rig={rig} geo={geo} material={material} attachments={attachments} />
      ))}
    </group>
  );
}

/** Shop display stand: brushed-steel base plate behind the heels, rod into the right calf. */
function Stand({ rig }: { rig: Rig }) {
  const s = rig.params.height / 180;
  const x = -rig.landmarks.hipHalf;
  const rodTop = rig.landmarks.knee - 0.1 * s;
  const metal = useMemo(() => new MeshStandardMaterial({ color: "#d8d8d6", metalness: 0.55, roughness: 0.28 }), []);
  useEffect(() => () => metal.dispose(), [metal]);
  return (
    <group>
      <mesh position={[x * 0.45, 0.005, -0.12 * s]} material={metal} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.165, 0.01, 72]} />
      </mesh>
      <mesh position={[x, 0.01 + rodTop / 2, -0.052 * s]} material={metal} castShadow>
        <cylinderGeometry args={[0.0065, 0.0065, rodTop, 16]} />
      </mesh>
    </group>
  );
}

/**
 * Display mannequin: sculpted lofted body parts parented to a Mixamo-named bone tree.
 * Changing the rig (body params) regenerates geometry; bones stay the same, so garments
 * attached via `attachments` follow automatically.
 */
export function Mannequin3D({ rig, attachments, color = "#f1efeb" }: { rig: Rig; attachments?: BoneAttachments; color?: string }) {
  const geo = useBodyGeometry(rig);
  // Gloss fibreglass, as used in retail display
  const material = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color,
        roughness: 0.38,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        specularIntensity: 0.6,
      }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group>
      <BoneNode name="Hips" rig={rig} geo={geo} material={material} attachments={attachments} />
      <Stand rig={rig} />
    </group>
  );
}
