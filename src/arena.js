import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG } from './config.js';
import { instance } from './models.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** 建立固定的圓形浮島地面、帶缺口的環狀圍欄、中央水晶與彈力蘑菇。 */
export function buildArena(RAPIER, world, scene, registry, models) {
  const A = CFG.arena;

  // --- 浮島地面：固定圓柱 Collider，頂面位於 y = 0 ---
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -A.thickness / 2, 0));
  const ground = world.createCollider(RAPIER.ColliderDesc.cylinder(A.thickness / 2, A.radius).setFriction(0.9).setRestitution(0.2), groundBody);
  registry.set(ground.handle, { kind: 'ground' });

  // 浮島模型：縮放到與物理地面同寬，並讓（已壓平的）頂面對齊 y = 0
  const island = instance(models.island[0], { scale: A.radius * 1.03 });
  island.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  island.position.y = 0.06 - new THREE.Box3().setFromObject(island).max.y;
  scene.add(island);

  // --- 環狀圍欄：碰撞體為排成弧形的長方體；弧段之間留缺口供 Ring Out ---
  // 外觀：風化石塊 + 青苔 + 弧段兩端的符文石柱，配合浮島的石砌風格。
  const fenceBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const segAngle = THREE.MathUtils.degToRad(A.fenceArcSpanDeg) / A.fenceSegsPerArc;
  const segLen = 2 * A.fenceRadius * Math.tan(segAngle / 2) + 0.02;
  const BLOCKS = 2, FOOT = 1.2; // 每段碰撞體對應的石塊數；石塊往地面下延伸的深度（島緣不規則處當作基座）
  const stoneCount = A.fenceArcs * (A.fenceSegsPerArc * BLOCKS + 2);
  const blockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.13);
  const stones = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), stoneCount);
  const moss = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), stoneCount);
  const gems = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.2, 0),
    flat(0x7ff3ff, { emissive: 0x2bb8d6, emissiveIntensity: 1.2, roughness: 0.3 }),
    A.fenceArcs * 2,
  );
  stones.castShadow = stones.receiveShadow = moss.receiveShadow = true;
  let seed = 7;
  const rnd = (lo = 0, hi = 1) => { // 固定種子，確保每次外觀一致
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return lo + (seed / 4294967296) * (hi - lo);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const col3 = new THREE.Color(), stoneA = new THREE.Color(0x70786f), stoneB = new THREE.Color(0xa3a996), mossA = new THREE.Color(0x4a7d2a), mossB = new THREE.Color(0x7aa838);
  const yAxis = new THREE.Vector3(0, 1, 0);
  let nStone = 0, nMoss = 0, nGem = 0;
  function addStone(a, w, h, len, mossChance) {
    const r = A.fenceRadius + rnd(-0.04, 0.04);
    e.set(rnd(-0.04, 0.04), -a + rnd(-0.07, 0.07), rnd(-0.04, 0.04)); // 本地 X 軸指向半徑方向
    q.setFromEuler(e);
    p.set(Math.cos(a) * r, (h - FOOT) / 2, Math.sin(a) * r);
    stones.setMatrixAt(nStone, m4.compose(p, q, sc.set(w, h + FOOT, len)));
    stones.setColorAt(nStone++, col3.copy(stoneA).lerp(stoneB, rnd()));
    if (rnd() < mossChance) {
      p.y = h - 0.02;
      moss.setMatrixAt(nMoss, m4.compose(p, q, sc.set(w * rnd(0.8, 1.05), 0.16, len * rnd(0.55, 0.95))));
      moss.setColorAt(nMoss++, col3.copy(mossA).lerp(mossB, rnd()));
    }
    return h;
  }
  for (let arc = 0; arc < A.fenceArcs; arc++) {
    const arcCenter = (arc / A.fenceArcs) * Math.PI * 2;
    for (let s = 0; s < A.fenceSegsPerArc; s++) {
      const a = arcCenter + (s - (A.fenceSegsPerArc - 1) / 2) * segAngle;
      p.set(Math.cos(a) * A.fenceRadius, A.fenceHeight / 2, Math.sin(a) * A.fenceRadius);
      q.setFromAxisAngle(yAxis, -a);
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(A.fenceThickness / 2, A.fenceHeight / 2, segLen / 2)
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setRestitution(A.fenceRestitution)
          .setFriction(0.2),
        fenceBody,
      );
      registry.set(col.handle, { kind: 'fence' });
      for (let k = 0; k < BLOCKS; k++) {
        const ba = a + ((k + 0.5) / BLOCKS - 0.5) * segAngle;
        addStone(ba, rnd(0.5, 0.66), A.fenceHeight * rnd(0.92, 1.25), (segLen / BLOCKS) * rnd(0.97, 1.08), 0.55);
      }
    }
    // 弧段兩端的石柱，頂端嵌一顆小水晶，標示缺口位置
    for (const side of [-1, 1]) {
      const pa = arcCenter + side * (A.fenceSegsPerArc / 2) * segAngle;
      const h = addStone(pa, 0.8, A.fenceHeight * 1.75, 0.8, 0);
      p.set(Math.cos(pa) * A.fenceRadius, h + 0.2, Math.sin(pa) * A.fenceRadius);
      gems.setMatrixAt(nGem++, m4.compose(p, q.identity(), sc.set(1, 1.5, 1)));
    }
  }
  stones.count = nStone; moss.count = nMoss;
  scene.add(stones, moss, gems);

  // --- 能量水晶 ---
  const C = CFG.crystal;
  const crystalBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, C.radius, 0));
  const crystalCol = world.createCollider(RAPIER.ColliderDesc.ball(C.radius).setRestitution(0.7), crystalBody);
  const crystalMesh = instance(models.crystal[0], { scale: C.visualScale });
  crystalMesh.position.y = 1.6;
  const crystalLight = new THREE.PointLight(0x7ff3ff, 30, 10);
  crystalLight.position.y = 2;
  scene.add(crystalMesh, crystalLight);
  const crystal = { mesh: crystalMesh, punch: 0 };
  registry.set(crystalCol.handle, { kind: 'crystal', ref: crystal });

  // --- 彈力蘑菇 (Bumper) ---
  const B = CFG.bumpers;
  const bumpers = [];
  for (let i = 0; i < B.count; i++) {
    const a = (i / B.count) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * B.ringRadius, z = Math.sin(a) * B.ringRadius;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, B.halfHeight, z));
    const col = world.createCollider(
      RAPIER.ColliderDesc.cylinder(B.halfHeight, B.radius).setRestitution(1).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
      body,
    );
    // 模型底部貼地，縮放動畫以地面為支點
    const group = instance(models.mushroom[i % models.mushroom.length], { scale: B.visualScale, y: B.visualScale });
    group.rotation.y = -a + Math.PI / 2; // 正面朝外
    group.position.set(x, 0, z);
    scene.add(group);
    const bumper = { x, z, mesh: group, punch: 0 };
    bumpers.push(bumper);
    registry.set(col.handle, { kind: 'bumper', ref: bumper });
  }

  let t = 0;
  function update(dt) {
    t += dt;
    crystal.punch = Math.max(0, crystal.punch - dt * 4);
    const cs = 1 + crystal.punch * 0.35;
    crystalMesh.scale.setScalar(cs);
    crystalMesh.rotation.y = t * 0.9;
    crystalMesh.position.y = 1.6 + Math.sin(t * 2) * 0.12;
    for (const b of bumpers) {
      // 撞擊後的放大縮小彈性動畫
      b.punch = Math.max(0, b.punch - dt * 3.5);
      const wob = b.punch * Math.cos(b.punch * 14);
      b.mesh.scale.set(1 + wob * 0.45, 1 - wob * 0.3, 1 + wob * 0.45);
    }
  }

  return { crystal, bumpers, update };
}
