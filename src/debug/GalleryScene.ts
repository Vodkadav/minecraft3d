/**
 * ?scene=gallery — specimen gallery (spec §4): every species × 3 seeds on
 * labeled pedestals, rock wall, dressed cliff, debris ground square. Primary
 * review surface for the Phase-4 macro–meso–micro audit. Full lighting/post
 * pipeline (sun/sky, CSM+PCSS, GTAO, TRAA, grade) so review = world shading.
 *
 * ?row=trees|rocks|ground|dead frames the camera on one exhibit row.
 */

import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, mix, positionWorld, smoothstep, texture, uv, vec3 } from 'three/tsl';
import type { NF, NV4 } from '../gpu/TSLTypes';
import { hash12 } from '../gpu/noise/NoiseTSL';
import type { DataTexture } from 'three';
import { bakeBarkTextures, type BarkTextures } from '../gpu/passes/BarkSynth';
import { PostStack } from '../render/PostStack';
import { setupSunShadows } from '../render/ShadowSetup';
import { barkTexturedMaterial, foliageCardMaterial } from '../render/VegMaterials';
import { SunSky } from '../sky/SunSky';
import { captureFoliageAtlas } from '../vegetation/FoliageCards';
import { TREE_SPECIES } from '../vegetation/Species';
import { buildTree } from '../vegetation/TreeBuilder';
import type { WorldContext } from './Scenes';

const ROW_Z = { trees: 0, rocks: 40, ground: 70, dead: 100 } as const;

function labelSprite(text: string, sub: string): Mesh {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 144;
  const c = cv.getContext('2d');
  if (c) {
    c.fillStyle = 'rgba(20,24,28,0.92)';
    c.fillRect(0, 0, 512, 144);
    c.fillStyle = '#e8eef2';
    c.font = '600 44px system-ui, sans-serif';
    c.fillText(text, 18, 58);
    c.fillStyle = '#9fb2bf';
    c.font = '400 32px system-ui, sans-serif';
    c.fillText(sub, 18, 110);
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  const mat = new MeshStandardNodeMaterial();
  mat.map = tex;
  mat.roughness = 0.9;
  const m = new Mesh(new PlaneGeometry(2.6, 0.73), mat);
  return m;
}

export async function buildGalleryScene(ctx: WorldContext): Promise<void> {
  const { engine, params, seed } = ctx;
  const q = new URLSearchParams(window.location.search);

  ctx.progress(0.05, 'gallery: sky');
  const sunSky = new SunSky(engine, params.timeOfDay);
  await sunSky.init(engine.renderer);

  setupSunShadows(sunSky.sun, engine.camera, undefined, {
    maxFar: 320,
    lightMargin: 90,
  });

  // ---- ground: neutral matte with a faint 5 m scale grid ---------------------
  const groundMat = new MeshStandardNodeMaterial();
  {
    const wxz = positionWorld.xz;
    const n = hash12(wxz.mul(0.71).floor()) as NF;
    const base = mix(
      vec3(0.085, 0.1, 0.06),
      vec3(0.12, 0.125, 0.085),
      n.mul(0.7).add(hash12(wxz.mul(0.093).floor()).mul(0.3)),
    );
    const gx = smoothstep(0.0, 0.06, wxz.x.div(5).fract().sub(0.5).abs());
    const gz = smoothstep(0.0, 0.06, wxz.y.div(5).fract().sub(0.5).abs());
    groundMat.colorNode = base.mul(gx.min(gz).mul(0.12).add(0.88));
    groundMat.roughness = 0.96;
  }
  const ground = new Mesh(new CircleGeometry(420, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  engine.scene.add(ground);

  // ---- pedestal helper -------------------------------------------------------
  const pedestalMat = new MeshStandardNodeMaterial();
  pedestalMat.colorNode = vec3(0.32, 0.31, 0.3).mul(
    hash12(positionWorld.xz.mul(31)).mul(0.15).add(float(0.85)),
  );
  pedestalMat.roughness = 0.88;
  const pedestalGeo = new CylinderGeometry(2.0, 2.3, 0.42, 28);

  const exhibit = (
    x: number,
    z: number,
    title: string,
    sub: string,
  ): { x: number; z: number } => {
    const ped = new Mesh(pedestalGeo, pedestalMat);
    ped.position.set(x, 0.21, z);
    ped.receiveShadow = true;
    ped.castShadow = true;
    engine.scene.add(ped);
    const label = labelSprite(title, sub);
    label.position.set(x, 0.62, z + 2.45);
    label.rotation.x = -0.42;
    engine.scene.add(label);
    return { x, z };
  };

  // ---- foliage cluster atlases (captured once per species) -------------------
  ctx.progress(0.08, 'gallery: capturing foliage atlases');
  const atlases = new Map<string, DataTexture>();
  for (const sp of TREE_SPECIES) {
    if (!sp.foliage) continue;
    atlases.set(
      sp.id,
      await captureFoliageAtlas(engine.renderer, sp, seed.rng(`cards/${sp.id}`)),
    );
  }

  // ---- bark textures (synthesized per species layer) -------------------------
  ctx.progress(0.09, 'gallery: synthesizing bark');
  const barks = new Map<number, BarkTextures>();
  for (const sp of TREE_SPECIES) {
    if (barks.has(sp.barkLayer)) continue;
    barks.set(
      sp.barkLayer,
      await bakeBarkTextures(engine.renderer, sp.barkLayer, seed.sub(`bark/${sp.barkLayer}`) % 977),
    );
  }
  if (q.get('view') === 'atlas') {
    // raw atlas inspection row behind the trees
    let ax = -30;
    for (const tex of atlases.values()) {
      const mat = new MeshStandardNodeMaterial();
      const t = texture(tex, uv() as never) as unknown as NV4;
      mat.colorNode = t.rgb.mul(t.rgb);
      mat.opacityNode = t.w;
      mat.alphaTest = 0.1;
      const plane = new Mesh(new PlaneGeometry(10, 10), mat);
      plane.position.set(ax, 6, -22);
      engine.scene.add(plane);
      ax += 12;
    }
  }

  // ---- tree row: 6 species × 3 seeds ------------------------------------------
  let totalTris = 0;
  const spacing = 13;
  const groupGap = 6;
  const nSpecies = TREE_SPECIES.length;
  const rowWidth = nSpecies * 3 * spacing + (nSpecies - 1) * groupGap;
  let x = -rowWidth / 2;
  for (let si = 0; si < nSpecies; si++) {
    const sp = TREE_SPECIES[si];
    if (!sp) continue;
    for (let vi = 0; vi < 3; vi++) {
      ctx.progress(
        0.1 + (0.8 * (si * 3 + vi)) / (nSpecies * 3),
        `gallery: growing ${sp.id} #${vi}`,
      );
      // yield so boot UI can paint between heavy builds
      await new Promise((r) => setTimeout(r, 0));
      const rng = seed.rng(`tree/${sp.id}/${vi}`);
      const built = buildTree(sp, rng);
      totalTris += built.stats.tris;
      const at = exhibit(
        x,
        ROW_Z.trees,
        sp.label,
        `seed ${vi} · ${(built.stats.tris / 1000).toFixed(0)}k tris · ${built.stats.height.toFixed(1)} m`,
      );
      const barkTex = barks.get(sp.barkLayer) as BarkTextures;
      const barkMesh = new Mesh(built.bark, barkTexturedMaterial(barkTex));
      barkMesh.position.set(at.x, 0.42, at.z);
      barkMesh.castShadow = true;
      barkMesh.receiveShadow = true;
      engine.scene.add(barkMesh);
      const atlas = atlases.get(sp.id);
      if (built.foliage && atlas) {
        const folMesh = new Mesh(
          built.foliage,
          foliageCardMaterial(atlas, { color: sp.foliageColor }),
        );
        folMesh.position.copy(barkMesh.position);
        folMesh.castShadow = true;
        folMesh.receiveShadow = true;
        engine.scene.add(folMesh);
      }
      x += spacing;
    }
    x += groupGap;
  }
  engine.stats.counters['veg.tris'] = totalTris;

  // ---- post stack (no clouds in the gallery) ----------------------------------
  ctx.progress(0.95, 'gallery: post pipeline');
  const post = new PostStack(engine, sunSky.atmosphere, params.timeOfDay, null);
  engine.post = post;

  ctx.hooks.setTimeOfDay = (t: number) => {
    void (async () => {
      await sunSky.setTimeOfDay(t);
      post.setTimeOfDay(t);
    })();
  };

  // ---- camera ------------------------------------------------------------------
  if (params.cam === null) {
    const row = (q.get('row') ?? 'trees') as keyof typeof ROW_Z;
    const z = ROW_Z[row] ?? 0;
    engine.camera.position.set(0, 13, z + 64);
    engine.camera.lookAt(new Vector3(0, 9, z));
  }
  engine.onUpdate(() => {
    if (engine.camera.position.y < 0.6) engine.camera.position.y = 0.6;
  });

  ctx.progress(1, 'gallery ready');
}
