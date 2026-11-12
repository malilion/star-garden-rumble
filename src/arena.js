import * as THREE from 'three';
import { CFG } from './config.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** 建立固定的圓形浮島地面、帶缺口的環狀圍欄、中央水晶與彈力蘑菇。 */
export function buildArena(RAPIER, world, scene, registry) {
  const A = CFG.arena;

  // --- 浮島地面：固定圓柱 Collider，頂面位於 y = 0 ---
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -A.thickness / 2, 0));
  const ground = world.createCollider(RAPIER.ColliderDesc.cylinder(A.thickness / 2, A.radius).setFriction(0.9).setRestitution(0.2), groundBody);
  registry.set(ground.handle, { kind: 'ground' });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(A.radius, A.radius, A.thickness, 28), flat(0x7fd66b));
  top.position.y = -A.thickness / 2;
  top.receiveShadow = true;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(A.radius * 0.96, 9, 9), flat(0x8a6a4f));
  rock.rotation.x = Math.PI;
  rock.position.y = -A.thickness - 4.5;
  const centerPad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), flat(0xa7e88f));
  centerPad.rotation.x = -Math.PI / 2;
  centerPad.position.y = 0.01;
  centerPad.receiveShadow = true;
  scene.add(top, rock, centerPad);

  // --- 環狀圍欄：多段長方體排成弧形，弧段之間留缺口供 Ring Out ---
  const fenceBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const segAngle = THREE.MathUtils.degToRad(A.fenceArcSpanDeg) / A.fenceSegsPerArc;
  const segLen = 2 * A.fenceRadius * Math.tan(segAngle / 2) + 0.02;
  const fenceGeo = new THREE.BoxGeometry(A.fenceThickness, A.fenceHeight, segLen);
  const fenceMat = flat(0xf4e3c1);
  const fenceMesh = new THREE.InstancedMesh(fenceGeo, fenceMat, A.fenceArcs * A.fenceSegsPerArc);
  fenceMesh.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let arc = 0; arc < A.fenceArcs; arc++) {
    const arcCenter = (arc / A.fenceArcs) * Math.PI * 2;
    for (let s = 0; s < A.fenceSegsPerArc; s++) {
      const a = arcCenter + (s - (A.fenceSegsPerArc - 1) / 2) * segAngle;
      p.set(Math.cos(a) * A.fenceRadius, A.fenceHeight / 2, Math.sin(a) * A.fenceRadius);
      q.setFromAxisAngle(yAxis, -a); // 讓本地 X 軸指向半徑方向
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(A.fenceThickness / 2, A.fenceHeight / 2, segLen / 2)
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setRestitution(A.fenceRestitution)
          .setFriction(0.2),
        fenceBody,
      );
      registry.set(col.handle, { kind: 'fence' });
      fenceMesh.setMatrixAt(n++, m4.compose(p, q, one));
    }
  }
  scene.add(fenceMesh);

  // --- 能量水晶 ---
  const C = CFG.crystal;
  const crystalBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, C.radius, 0));
  const crystalCol = world.createCollider(RAPIER.ColliderDesc.ball(C.radius).setRestitution(0.7), crystalBody);
  const crystalMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(C.radius, 0),
    flat(0x7ff3ff, { emissive: 0x2bb8d6, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  crystalMesh.scale.set(0.85, 1.5, 0.85);
  crystalMesh.position.y = 1.6;
  crystalMesh.castShadow = true;
  const crystalLight = new THREE.PointLight(0x7ff3ff, 30, 10);
  crystalLight.position.y = 2;
  scene.add(crystalMesh, crystalLight);
  const crystal = { mesh: crystalMesh, punch: 0 };
  registry.set(crystalCol.handle, { kind: 'crystal', ref: crystal });

  // --- 彈力蘑菇 (Bumper) ---
  const B = CFG.bumpers;
  const bumpers = [];
  const stemGeo = new THREE.CylinderGeometry(B.radius * 0.55, B.radius * 0.7, B.halfHeight * 1.4, 8);
  const capGeo = new THREE.SphereGeometry(B.radius * 1.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < B.count; i++) {
    const a = (i / B.count) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * B.ringRadius, z = Math.sin(a) * B.ringRadius;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, B.halfHeight, z));
    const col = world.createCollider(
      RAPIER.ColliderDesc.cylinder(B.halfHeight, B.radius).setRestitution(1).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
      body,
    );
    const group = new THREE.Group();
    const stem = new THREE.Mesh(stemGeo, flat(0xfff3d6));
    stem.position.y = B.halfHeight * 0.7;
    const cap = new THREE.Mesh(capGeo, flat(0xff5a5a));
    cap.position.y = B.halfHeight * 1.2;
    cap.scale.y = 0.75;
    stem.castShadow = cap.castShadow = true;
    group.add(stem, cap);
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
    crystalMesh.scale.set(0.85 * cs, 1.5 * cs, 0.85 * cs);
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
