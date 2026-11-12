// 將一張「多個變體排在一起」的模型拆成獨立物件，各自置中、正規化（最大邊 = 2）、減面並壓縮。
// 需另外安裝 @gltf-transform/cli（含 core / functions / extensions / meshoptimizer / sharp）。
// 用法：node split-models.mjs <來源.glb> <輸出.glb> <每個物件目標面數> [誤差] [保留的物件索引,逗號分隔]
//   crystal : 6000 0.06 0      sprite : 6000 0.06 1      mushroom : 4000 0.06 0,1,2      urchin : 5000 0.06 0,2
//   island  : NOSPLIT=1 FLATTEN=1.62,1.69,0.12（不分群，並把頂面壓平以貼合物理地面） 30000 0.04
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [, , src, dst, targetArg, errArg, keepArg] = process.argv;
const target = +targetArg, err = +(errArg || 0.02);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
const material = prims[0].getMaterial();

let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
const data = prims.map((p) => {
  const pos = p.getAttribute('POSITION').getArray(), nor = p.getAttribute('NORMAL').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray();
  const idx = p.getIndices().getArray();
  if (process.env.FLATTEN) { const [a, ref, f] = process.env.FLATTEN.split(',').map(Number); for (let i = 1; i < pos.length; i += 3) if (pos[i] > a) pos[i] = ref + (pos[i] - ref) * f; }
  for (let i = 0; i < pos.length; i++) { const k = i % 3; if (pos[i] < min[k]) min[k] = pos[i]; if (pos[i] > max[k]) max[k] = pos[i]; }
  return { pos, nor, uv, idx };
});
// XY 佔用格 + 4 連通分群
const N = 120, cw = (max[0] - min[0]) / N + 1e-9, ch = (max[1] - min[1]) / N + 1e-9;
const cell = (x, y) => Math.min(N - 1, Math.floor((x - min[0]) / cw)) + N * Math.min(N - 1, Math.floor((y - min[1]) / ch));
const occ = new Uint8Array(N * N), label = new Int32Array(N * N).fill(-1);
for (const d of data) for (let i = 0; i < d.pos.length; i += 3) occ[cell(d.pos[i], d.pos[i + 1])] = 1;
if (process.env.NOSPLIT) occ.fill(1);
let nl = 0; const sizes = [];
for (let s = 0; s < N * N; s++) {
  if (!occ[s] || label[s] >= 0) continue;
  const st = [s]; label[s] = nl; let c = 0;
  while (st.length) { const q = st.pop(); c++; const x = q % N, y = (q / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const t = nx + N * ny; if (occ[t] && label[t] < 0) { label[t] = nl; st.push(t); } } }
  sizes.push(c); nl++;
}
const keep = sizes.map((c, i) => [c, i]).filter(([c]) => c > 40).map(([, i]) => i);
const buffer = root.listBuffers()[0];
const items = [];
for (const L of keep) {
  const P = [], Nn = [], U = [], I = [];
  for (const d of data) {
    const remap = new Map();
    for (let t = 0; t < d.idx.length; t += 3) {
      const a = d.idx[t];
      if (label[cell(d.pos[a * 3], d.pos[a * 3 + 1])] !== L) continue;
      for (let k = 0; k < 3; k++) {
        const v = d.idx[t + k]; let n = remap.get(v);
        if (n === undefined) { n = P.length / 3; remap.set(v, n); P.push(d.pos[v * 3], d.pos[v * 3 + 1], d.pos[v * 3 + 2]); Nn.push(d.nor[v * 3], d.nor[v * 3 + 1], d.nor[v * 3 + 2]); U.push(d.uv[v * 2], d.uv[v * 2 + 1]); }
        I.push(n);
      }
    }
  }
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < lo[k]) lo[k] = P[i]; if (P[i] > hi[k]) hi[k] = P[i]; }
  const c = lo.map((v, k) => (v + hi[k]) / 2), s = 2 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  for (let i = 0; i < P.length; i++) P[i] = (P[i] - c[i % 3]) * s;
  items.push({ P, Nn, U, I, c, size: hi.map((v, k) => +((v - lo[k]) * s).toFixed(2)), raw: hi.map((v, k) => +(v - lo[k]).toFixed(3)) });
}
items.sort((a, b) => (Math.abs(a.c[1] - b.c[1]) > 0.25 ? b.c[1] - a.c[1] : a.c[0] - b.c[0]));
if (keepArg) { const k = keepArg.split(',').map(Number); const sel = k.map((i) => items[i]); items.length = 0; items.push(...sel); }
const scene = root.listScenes()[0];
for (const n of root.listNodes()) n.dispose();
for (const m of root.listMeshes()) m.dispose();
let total = 0;
items.forEach((it, i) => {
  const acc = (arr, type, T) => doc.createAccessor().setArray(new T(arr)).setType(type).setBuffer(buffer);
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', acc(it.P, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(it.Nn, 'VEC3', Float32Array)).setAttribute('TEXCOORD_0', acc(it.U, 'VEC2', Float32Array))
    .setIndices(acc(it.I, 'SCALAR', Uint32Array));
  scene.addChild(doc.createNode('item' + i).setMesh(doc.createMesh('item' + i).addPrimitive(prim)));
  total += it.I.length / 3;
  console.log(`  item${i} tris=${it.I.length / 3} size=${it.size} raw=${it.raw} center=${it.c.map((v) => v.toFixed(2))}`);
});
await doc.transform(
  prune(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, (target * items.length) / total), error: err }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  prune(), meshopt({ encoder: MeshoptEncoder }),
);
root.listMeshes().forEach((m) => console.log('   ->', m.getName(), m.listPrimitives()[0].getIndices().getCount() / 3));
await io.write(dst, doc);
