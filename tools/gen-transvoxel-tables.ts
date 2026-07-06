/**
 * One-shot generator: parses Eric Lengyel's Transvoxel.cpp (MIT, transvoxel.org)
 * into a TypeScript module of typed arrays.
 *
 * Usage: npx tsx gen-transvoxel-tables.ts <path-to-Transvoxel.cpp> <output.ts>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , cppPath, outPath] = process.argv;
if (!cppPath || !outPath) {
  console.error('usage: tsx gen-transvoxel-tables.ts <Transvoxel.cpp> <out.ts>');
  process.exit(1);
}
const src = readFileSync(cppPath, 'utf8');

/** Extract the bracketed initializer that follows `const <type> name[...] =`. */
function extractInitializer(name: string): string {
  const declIdx = src.indexOf(` ${name}[`);
  if (declIdx < 0) throw new Error(`declaration not found: ${name}`);
  const braceStart = src.indexOf('{', declIdx);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

function parseNumbers(text: string): number[] {
  return (text.match(/0x[0-9A-Fa-f]+|\d+/g) ?? []).map((t) => Number(t));
}

// --- flat numeric tables ---------------------------------------------------
const regularCellClass = parseNumbers(extractInitializer('regularCellClass'));
if (regularCellClass.length !== 256) throw new Error(`regularCellClass: ${regularCellClass.length}`);

const transitionCellClass = parseNumbers(extractInitializer('transitionCellClass'));
if (transitionCellClass.length !== 512) throw new Error(`transitionCellClass: ${transitionCellClass.length}`);

const transitionCornerData = parseNumbers(extractInitializer('transitionCornerData'));
if (transitionCornerData.length !== 13) throw new Error(`transitionCornerData: ${transitionCornerData.length}`);

// --- struct tables: fixed-size rows { geometryCounts, vertexIndex[N] } ------
function parseStructRows(name: string, idxLen: number): { counts: number; idx: number[] }[] {
  const body = extractInitializer(name).slice(1, -1); // strip outer braces
  const rows: { counts: number; idx: number[] }[] = [];
  let depth = 0;
  let rowStart = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') {
      if (depth === 0) rowStart = i;
      depth++;
    } else if (body[i] === '}') {
      depth--;
      if (depth === 0) {
        const nums = parseNumbers(body.slice(rowStart, i + 1));
        const counts = nums.length ? nums[0] : 0;
        const idx = nums.slice(1);
        if (idx.length > idxLen) throw new Error(`${name} row too long: ${idx.length}`);
        rows.push({ counts, idx });
      }
    }
  }
  return rows;
}

const regularCellData = parseStructRows('regularCellData', 15);
if (regularCellData.length !== 16) throw new Error(`regularCellData: ${regularCellData.length}`);

const transitionCellData = parseStructRows('transitionCellData', 36);
if (transitionCellData.length !== 56) throw new Error(`transitionCellData: ${transitionCellData.length}`);

// --- 2-D vertex-data tables --------------------------------------------------
function parse2D(name: string, rowCount: number, rowLen: number): number[][] {
  const body = extractInitializer(name).slice(1, -1);
  const rows: number[][] = [];
  let depth = 0;
  let rowStart = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') {
      if (depth === 0) rowStart = i;
      depth++;
    } else if (body[i] === '}') {
      depth--;
      if (depth === 0) {
        const nums = parseNumbers(body.slice(rowStart, i + 1));
        if (nums.length > rowLen) throw new Error(`${name} row too long: ${nums.length}`);
        rows.push(nums);
      }
    }
  }
  if (rows.length !== rowCount) throw new Error(`${name}: ${rows.length} rows`);
  return rows;
}

const regularVertexData = parse2D('regularVertexData', 256, 12);
const transitionVertexData = parse2D('transitionVertexData', 512, 12);

// --- emit --------------------------------------------------------------------
function u8(nums: number[]): string {
  return `Uint8Array.from([${nums.join(',')}])`;
}
function u16(nums: number[]): string {
  return `Uint16Array.from([${nums.join(',')}])`;
}
// struct rows -> packed: counts array + fixed-stride index array (pad with 0)
function packStruct(rows: { counts: number; idx: number[] }[], stride: number) {
  const counts = rows.map((r) => r.counts);
  const idx = rows.flatMap((r) => [...r.idx, ...Array(stride - r.idx.length).fill(0)]);
  return { counts, idx };
}
// 2-D u16 rows -> fixed-stride flat array (pad with 0)
function pack2D(rows: number[][], stride: number): number[] {
  return rows.flatMap((r) => [...r, ...Array(stride - r.length).fill(0)]);
}

const rcd = packStruct(regularCellData, 15);
const tcd = packStruct(transitionCellData, 36);
for (const c of [...rcd.counts, ...tcd.counts]) {
  if (c < 0 || c > 255) throw new Error(`geometryCounts out of u8 range: ${c}`);
}

const out = `// GENERATED FILE — do not edit by hand.
// Transvoxel Algorithm lookup tables, converted from Transvoxel.cpp
// Copyright 2009 by Eric Lengyel — MIT License — https://transvoxel.org/
// (see CREDITS.md). Generator: tools/gen-transvoxel-tables.ts equivalent (scratch).
//
// Packing: struct tables are split into a counts array (high nibble = vertex
// count, low nibble = triangle count) and a fixed-stride flat index array.
// 2-D vertex-data tables are flattened at fixed stride 12, zero-padded.

/** Maps 8-bit Marching Cubes case -> equivalence class (0-15). High bit 0x80 on some entries flags inverted winding in Lengyel's convention; here values are verbatim. */
export const regularCellClass = ${u8(regularCellClass)};

/** Vertex/triangle counts per regular class; high nibble = vertices, low = triangles. */
export const regularCellCounts = ${u8(rcd.counts)};

/** Triangulation vertex indices per regular class, stride ${15}. */
export const regularCellIndices = ${u8(rcd.idx)};

/** Per-case edge/vertex data, stride 12. Low byte: edge endpoint corner indices; high byte: reuse data. 0 = unused slot. */
export const regularVertexData = ${u16(pack2D(regularVertexData, 12))};

/** Maps 9-bit transition-cell case -> equivalence class. High bit 0x80 = inverted winding. */
export const transitionCellClass = ${u8(transitionCellClass)};

/** Vertex/triangle counts per transition class; high nibble = vertices (note: stored in a long's high nibble semantics identical to regular). */
export const transitionCellCounts = ${u8(tcd.counts)};

/** Triangulation vertex indices per transition class, stride ${36}. */
export const transitionCellIndices = ${u8(tcd.idx)};

/** Per-case transition vertex data, stride 12. */
export const transitionVertexData = ${u16(pack2D(transitionVertexData, 12))};

/** Maps transition-cell sample index (0-12) to reuse corner data. */
export const transitionCornerData = ${u8(transitionCornerData)};
`;

writeFileSync(outPath, out);
console.log(
  `ok: rcc=${regularCellClass.length} rcd=${regularCellData.length} rvd=${regularVertexData.length} ` +
    `tcc=${transitionCellClass.length} tcd=${transitionCellData.length} tvd=${transitionVertexData.length}`,
);
