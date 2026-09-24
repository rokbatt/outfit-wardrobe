"use client";

import { CameraControls, CameraControlsImpl, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MathUtils, type PerspectiveCamera } from "three";
import type { BodyParams } from "@/lib/avatar/body";
import { buildRig, type Rig } from "@/lib/avatar/rig";
import { useGarmentAttachments, type Outfit3D } from "./garments";
import { Mannequin3D } from "./Mannequin3D";

const FOV = 28;
const { ACTION } = CameraControlsImpl;
const STAGE = "#f2f2f1";
type View = "front" | "side" | "back";
const AZIMUTH: Record<View, number> = { front: 0, side: Math.PI / 2, back: Math.PI };
const POLAR = MathUtils.degToRad(84); // camera slightly above the waist, looking level

/** Distance at which the whole figure fits the viewport (height and width). */
function fitDistance(rig: Rig, aspect: number) {
  const t = Math.tan(MathUtils.degToRad(FOV / 2));
  // extra room below the feet for the view-preset bar
  const dh = (rig.landmarks.top * 1.32) / 2 / t;
  const dw = 0.95 / 2 / (t * aspect);
  return Math.max(dh, dw);
}

function Rigging({
  rig,
  controls,
  spin,
  onInteract,
}: {
  rig: Rig;
  controls: React.RefObject<CameraControls | null>;
  spin: boolean;
  onInteract: () => void;
}) {
  const { size, invalidate } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const framed = useRef(false);

  // Frame the figure on mount, on resize and when the body changes height.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const d = fitDistance(rig, aspect);
    const ty = rig.landmarks.top * 0.45;
    c.minDistance = d * 0.38;
    c.maxDistance = d * 1.5;
    const az = framed.current ? c.azimuthAngle : AZIMUTH.front;
    const polar = framed.current ? c.polarAngle : POLAR;
    c.setTarget(0, ty, 0, framed.current);
    c.rotateTo(az, polar, false);
    c.dollyTo(d, framed.current);
    framed.current = true;
    invalidate();
  }, [rig, aspect, controls, invalidate]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.addEventListener("controlstart", onInteract);
    return () => c.removeEventListener("controlstart", onInteract);
  }, [controls, onInteract]);

  // Turntable: rotate slowly while "360" is on (demand frameloop → keep invalidating).
  useFrame((_, dt) => {
    if (!spin || !controls.current) return;
    controls.current.azimuthAngle += dt * 0.55;
    invalidate();
  });
  return null;
}

function Studio() {
  return (
    <>
      <color attach="background" args={[STAGE]} />
      <hemisphereLight args={["#ffffff", "#d9d6d0", 0.55]} />
      {/* key light — casts the body's self-shadows and the floor shadow */}
      <directionalLight
        position={[2.2, 4.2, 3]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={6}
        shadow-camera-left={-1.3}
        shadow-camera-right={1.3}
        shadow-camera-top={2.3}
        shadow-camera-bottom={-0.2}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
      {/* fill + rim */}
      <directionalLight position={[-3, 2.2, 1.5]} intensity={0.55} />
      <directionalLight position={[0, 3, -4]} intensity={0.9} />
      {/* soft studio reflections, generated locally (no HDR download) */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.6} position={[0, 4, 2]} rotation-x={Math.PI / 2} scale={[6, 4, 1]} />
        <Lightformer intensity={1.1} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer intensity={0.8} position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer intensity={0.6} position={[0, 1, -4]} scale={[6, 3, 1]} />
      </Environment>
      {/* floor: real shadow from the key light + soft contact shadow */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[3, 64]} />
        <shadowMaterial transparent opacity={0.1} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} scale={2.4} resolution={512} blur={2.6} opacity={0.42} far={1.2} color="#3a3530" />
    </>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Interactive 3D stage: drag / swipe to rotate, wheel / pinch to zoom, FRONT · SIDE · BACK presets.
 * The outfit is built from 3D garment templates and attached to the mannequin's bones.
 */
export default function AvatarViewer({
  body,
  outfit = {},
  className = "",
  overlay,
}: {
  body: BodyParams;
  outfit?: Outfit3D;
  className?: string;
  /** extra HTML drawn over the canvas (look summary etc.) */
  overlay?: ReactNode;
}) {
  const rig = useMemo(() => buildRig(body), [body]);
  const attachments = useGarmentAttachments(rig, outfit);
  const controls = useRef<CameraControls | null>(null);
  const [view, setView] = useState<View | null>("front");
  const [spin, setSpin] = useState(false);
  const [touched, setTouched] = useState(false);
  const [gl, setGl] = useState<boolean | null>(null);

  useEffect(() => {
    setGl(webglAvailable());
  }, []);

  const onInteract = useCallback(() => {
    setTouched(true);
    setView(null);
    setSpin(false);
  }, []);

  const goTo = (v: View) => {
    setSpin(false);
    setView(v);
    setTouched(true);
    // take the short way round from wherever the user left the camera
    const c = controls.current;
    if (!c) return;
    const cur = c.azimuthAngle;
    const target = AZIMUTH[v] + Math.round((cur - AZIMUTH[v]) / (Math.PI * 2)) * Math.PI * 2;
    c.rotateTo(target, POLAR, true);
  };
  const reset = () => {
    goTo("front");
    const c = controls.current;
    if (c) c.dollyTo(fitDistance(rig, (c.camera as PerspectiveCamera).aspect), true);
  };

  const unsupported = (
    <div className="grid h-full place-items-center p-6 text-center text-[13px] text-mute">
      이 브라우저에서 3D(WebGL)를 사용할 수 없어요.
      <br />
      하드웨어 가속을 켜거나 다른 브라우저로 열어 주세요.
    </div>
  );

  return (
    <div className={`relative overflow-hidden rounded-lg bg-stage ${className}`}>
      {gl === false ? (
        unsupported
      ) : gl ? (
        <GLBoundary fallback={unsupported}>
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            frameloop="demand"
            camera={{ fov: FOV, near: 0.05, far: 50, position: [0, 1, 6] }}
            aria-label="3D 아바타 — 드래그해서 회전, 휠이나 핀치로 확대"
            className="!absolute inset-0 cursor-grab active:cursor-grabbing"
          >
            <Suspense fallback={null}>
              <Studio />
              <Mannequin3D rig={rig} attachments={attachments} />
            </Suspense>
            <CameraControls
              ref={controls}
              makeDefault
              smoothTime={0.28}
              draggingSmoothTime={0.08}
              azimuthRotateSpeed={0.9}
              minPolarAngle={MathUtils.degToRad(48)}
              maxPolarAngle={MathUtils.degToRad(100)}
              dollyToCursor={false}
              // left drag / one finger = rotate · wheel / pinch = zoom · no panning
              mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.NONE, right: ACTION.NONE, wheel: ACTION.DOLLY }}
              touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
            />
            <Rigging rig={rig} controls={controls} spin={spin} onInteract={onInteract} />
          </Canvas>
        </GLBoundary>
      ) : null}

      {overlay}

      {/* rotate hint — disappears after the first interaction */}
      {gl && !touched && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[58px] flex justify-center">
          <span className="rounded-full bg-paper/85 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-ink-2 shadow-sm backdrop-blur">
            ↔ ROTATE ↔
          </span>
        </div>
      )}

      {/* view presets */}
      {gl && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <div className="flex items-center gap-0.5 rounded-full border border-line bg-paper/90 p-0.5 shadow-sm backdrop-blur">
            {(["front", "side", "back"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => goTo(v)}
                aria-pressed={view === v}
                className={`h-7 rounded-full px-3 text-[10.5px] font-bold tracking-[0.08em] transition ${
                  view === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
            <button
              onClick={() => {
                setSpin((s) => !s);
                setView(null);
                setTouched(true);
              }}
              aria-pressed={spin}
              className={`h-7 rounded-full px-3 text-[10.5px] font-bold tracking-[0.08em] transition ${spin ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
            >
              360°
            </button>
            <button onClick={reset} aria-label="시점 초기화" className="h-7 rounded-full px-2.5 text-[13px] text-ink-2 hover:text-ink">
              ⟲
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
