import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// public/models/*.glb 由 tools/split-models.mjs 產生：
// 每個檔案內含 item0..n 節點，各自以包圍盒中心為原點、最大邊長正規化為 2，正面朝 +Z。
const FILES = ['island', 'crystal', 'mushroom', 'sprite', 'urchin'];

/** 載入所有模型，回傳 { island: [item0], mushroom: [item0, item1, item2], ... }。 */
export async function loadModels() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = {};
  await Promise.all(FILES.map(async (name) => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    models[name] = gltf.scene.children.slice().sort((a, b) => a.name.localeCompare(b.name));
  }));
  return models;
}

/**
 * 以範本建立一個實例（共用 geometry / material）。
 * 回傳的外層 Group 交給遊戲邏輯控制位置 / 旋轉 / 彈性縮放；模型本身的縮放與偏移放在內層。
 */
export function instance(template, { scale = 1, y = 0 } = {}) {
  const inner = new THREE.Group();
  inner.add(template.clone());
  inner.scale.setScalar(scale);
  inner.position.y = y;
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}
