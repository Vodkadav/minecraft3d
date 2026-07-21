/**
 * ?hand3d=1 — real 3D first-person arm/tool viewmodel (procedural low-poly
 * mesh, no external assets), rendered as an AFTER-POST OVERLAY so it never
 * clips into terrain and never receives world TRAA/AO/fog/aerial haze.
 *
 * Seam: `PostStack.render()` (see src/render/PostStack.ts) finishes each
 * frame with `RenderPipeline._quadMesh.render(renderer)` — a plain
 * `renderer.render(fullscreenQuad, quadCamera)` call onto whatever render
 * target is currently bound. Nothing in the engine leaves a non-null render
 * target bound afterwards (Impostors/FoliageCards/HalfResMrt all
 * save+restore `prevTarget`), so once `post.render()` returns, the canvas
 * swap-chain holds the fully graded frame and is the CURRENT render target.
 * This module wraps `engine.post` (the `{render, meter}` object PostStack
 * hands to Engine — see Engine.post) so that immediately after the real
 * `post.render()` call, it issues ONE MORE `renderer.render()` call with its
 * own tiny scene/camera/lights straight onto that same canvas:
 *   - `autoClearColor = false` for that call — the graded frame underneath
 *     is preserved, not wiped;
 *   - `autoClearDepth = true` — the depth buffer is cleared fresh so the
 *     viewmodel depth-tests only against itself, never the world;
 *   - both flags are restored immediately after, so nothing else observes
 *     the toggle.
 * The real PostStack render — and therefore the finished desktop LAAS output
 * — is called unmodified and first; this only ever draws MORE on top, in the
 * viewmodel's own screen corner. Zero edits to src/core or src/render.
 *
 * Same handle surface as the 2D `HandViewmodel` (`swing()`/`dispose()`) so
 * the two are interchangeable at the call site — see the one-line swap note
 * in TerrainScene.ts. `el` isn't meaningful here (there is no DOM node; the
 * viewmodel is drawn into the same canvas as the world), so it's omitted.
 */

import {
  AmbientLight,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  type Material,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import type { WebGPURenderer } from "three/webgpu";

/** Narrow port onto Engine — just enough to hook the post-render seam and
 *  tick an animation; keeps this module testable without a real renderer. */
export interface HandViewmodel3DHost {
  readonly renderer: WebGPURenderer;
  post: { render(): void; meter(renderer: WebGPURenderer): void } | null;
  onUpdate(fn: (dt: number, worldTime: number) => void): void;
}

export interface HandViewmodel3DOptions {
  /** the canvas element DigTool/PlacementTool bind their pointer-lock input to. */
  readonly dom: HTMLElement;
  readonly reducedMotion: () => boolean;
  readonly doc?: Document;
}

export interface HandViewmodel3DHandle {
  swing(kind?: "dig" | "place"): void;
  dispose(): void;
}

/** matches the 2D HandViewmodel's SWING_MS for identical feel/timing. */
const SWING_MS = 260;
// peak-time fractions lifted straight from the 2D component's keyframes
// (lw-hand-swing 38%, lw-hand-place 40%, lw-hand-pulse 45%) — same motion
// design, replayed as a 3D transform instead of a CSS animation.
const DIG_PEAK = 0.38;
const PLACE_PEAK = 0.4;
const PULSE_PEAK = 0.45;

/** rising 0→1→0 envelope over t∈[0,1], peaking at `peak`; smoothstep-eased. */
function envelope(t: number, peak: number): number {
  if (t <= 0 || t >= 1) return 0;
  const phase = t < peak ? t / peak : 1 - (t - peak) / (1 - peak);
  return phase * phase * (3 - 2 * phase);
}

interface HandGroup {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly swingGroup: Group;
  readonly restPosition: Vector3;
  dispose(): void;
}

/** Procedural low-poly arm + pickaxe — primitives only, no bundled assets;
 *  palette matches the 2D SVG hand for visual continuity. */
function buildHandGroup(): HandGroup {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  function geo<T extends BufferGeometry>(g: T): T {
    geometries.push(g);
    return g;
  }
  function mat(color: number, roughness: number, metalness: number): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness, metalness });
    materials.push(m);
    return m;
  }

  const skin = mat(0xd99968, 0.85, 0.0);
  const wood = mat(0x7a5230, 0.8, 0.0);
  const metal = mat(0x9aa0a8, 0.35, 0.7);

  const root = new Group();

  // forearm rises from the corner and stays planted (does not swing)
  const forearm = new Mesh(geo(new CylinderGeometry(0.05, 0.075, 0.42, 8)), skin);
  forearm.position.set(0, -0.02, 0);
  forearm.rotation.z = 0.35;
  root.add(forearm);

  // everything below swings from the wrist pivot
  const swingGroup = new Group();
  swingGroup.position.set(0.02, 0.19, 0);
  root.add(swingGroup);

  const fist = new Mesh(geo(new SphereGeometry(0.07, 8, 6)), skin);
  swingGroup.add(fist);

  const shaft = new Mesh(geo(new CylinderGeometry(0.013, 0.016, 0.5, 6)), wood);
  shaft.position.set(0.16, 0.16, 0);
  shaft.rotation.z = -0.9;
  swingGroup.add(shaft);

  const rivet = new Mesh(geo(new SphereGeometry(0.025, 6, 6)), metal);
  rivet.position.set(0.34, 0.32, 0);
  swingGroup.add(rivet);

  const tipLeft = new Mesh(geo(new ConeGeometry(0.05, 0.22, 4)), metal);
  tipLeft.position.set(0.22, 0.34, 0);
  tipLeft.rotation.z = Math.PI / 2 + 0.3;
  swingGroup.add(tipLeft);

  const tipRight = new Mesh(geo(new ConeGeometry(0.05, 0.22, 4)), metal);
  tipRight.position.set(0.46, 0.34, 0);
  tipRight.rotation.z = -Math.PI / 2 - 0.3;
  swingGroup.add(tipRight);

  // bottom-right viewmodel placement, tucked toward the corner like the 2D hand
  root.position.set(0.32, -0.34, -0.62);
  root.rotation.set(0.05, -0.5, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 4);
  const key = new DirectionalLight(0xfff2e0, 1.7);
  key.position.set(0.6, 1.0, 0.9);
  const fill = new AmbientLight(0x8899aa, 0.6);
  scene.add(key, fill, root);

  return {
    scene,
    camera,
    swingGroup,
    restPosition: swingGroup.position.clone(),
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function mountHandViewmodel3D(
  host: HandViewmodel3DHost,
  opts: HandViewmodel3DOptions,
): HandViewmodel3DHandle {
  const doc = opts.doc ?? document;
  const hand = buildHandGroup();
  const { swingGroup, restPosition } = hand;

  let swingState: { start: number; kind: "dig" | "place"; reduced: boolean } | null = null;
  let disposed = false;

  function resetPose(): void {
    swingGroup.position.copy(restPosition);
    swingGroup.rotation.set(0, 0, 0);
    swingGroup.scale.setScalar(1);
  }
  resetPose();

  function swing(kind: "dig" | "place" = "dig"): void {
    swingState = { start: performance.now(), kind, reduced: opts.reducedMotion() };
  }

  host.onUpdate(() => {
    if (disposed || !swingState) return;
    const t = (performance.now() - swingState.start) / SWING_MS;
    if (t >= 1) {
      resetPose();
      swingState = null;
      return;
    }
    if (swingState.reduced) {
      const e = envelope(t, PULSE_PEAK);
      swingGroup.position.set(restPosition.x, restPosition.y - 0.035 * e, restPosition.z);
      swingGroup.rotation.x = 0;
      swingGroup.scale.setScalar(1);
    } else if (swingState.kind === "place") {
      const e = envelope(t, PLACE_PEAK);
      swingGroup.position.set(
        restPosition.x - 0.05 * e,
        restPosition.y - 0.04 * e,
        restPosition.z,
      );
      swingGroup.rotation.x = 0;
      swingGroup.scale.setScalar(1 - 0.03 * e);
    } else {
      const e = envelope(t, DIG_PEAK);
      swingGroup.rotation.x = -0.9 * e;
      swingGroup.position.set(
        restPosition.x - 0.03 * e,
        restPosition.y + 0.05 * e,
        restPosition.z,
      );
      swingGroup.scale.setScalar(1);
    }
  });

  const onMouseDown = (e: MouseEvent): void => {
    if (doc.pointerLockElement !== opts.dom) return;
    if (e.button === 0) swing("dig");
    else if (e.button === 2) swing("place");
  };
  opts.dom.addEventListener("mousedown", onMouseDown);

  const onResize = (): void => {
    hand.camera.aspect = window.innerWidth / window.innerHeight;
    hand.camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);

  // wrap engine.post: the real pass renders first (untouched world output),
  // then this overlay draws on top of the composited frame — see header.
  const originalPost = host.post;
  host.post = {
    meter(renderer: WebGPURenderer): void {
      originalPost?.meter(renderer);
    },
    render(): void {
      originalPost?.render();
      const { renderer } = host;
      const prevColor = renderer.autoClearColor;
      const prevDepth = renderer.autoClearDepth;
      renderer.autoClearColor = false;
      renderer.autoClearDepth = true;
      renderer.render(hand.scene, hand.camera);
      renderer.autoClearColor = prevColor;
      renderer.autoClearDepth = prevDepth;
    },
  };

  return {
    swing,
    dispose(): void {
      disposed = true;
      opts.dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onResize);
      host.post = originalPost;
      hand.dispose();
    },
  };
}
