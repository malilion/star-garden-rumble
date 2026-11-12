import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CFG } from './config.js';

const P = CFG.player;
const AIM_Y = 0.12; // 瞄準線貼地高度

/** 主控守護球 + 彈射（Slingshot）操控。 */
export function createPlayer(RAPIER, world, scene, camera, dom, registry, { canAim, onLaunch }) {
  // --- 剛體：高彈性動態球 ---
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(P.spawn.x, P.spawn.y, P.spawn.z)
      .setLinearDamping(P.linearDamping)
      .setAngularDamping(P.angularDamping)
      .setCcdEnabled(true),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(P.radius)
      .setRestitution(P.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setFriction(P.friction)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  registry.set(collider.handle, { kind: 'player' });

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(P.radius, 1),
    new THREE.MeshStandardMaterial({ color: 0xfff2a8, emissive: 0xffb300, emissiveIntensity: 0.45, flatShading: true, roughness: 0.4 }),
  );
  mesh.castShadow = true;
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(P.radius * 1.25, P.radius * 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  );
  marker.rotation.x = -Math.PI / 2;
  scene.add(mesh, marker);

  // --- 瞄準視覺：預測軌跡虛線 (Line2)、箭頭、橡皮筋拉線 ---
  const aimMat = new LineMaterial({ color: 0xffffff, linewidth: 0.16, worldUnits: true, dashed: true, dashSize: 0.5, gapSize: 0.35, transparent: true, depthTest: false });
  const aimGeo = new LineGeometry();
  aimGeo.setPositions([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
  const aimLine = new Line2(aimGeo, aimMat);
  const bandMat = new LineMaterial({ color: 0xffffff, linewidth: 0.1, worldUnits: true, transparent: true, opacity: 0.6, depthTest: false });
  const bandGeo = new LineGeometry();
  bandGeo.setPositions([0, 0, 0, 1, 0, 0]);
  const bandLine = new Line2(bandGeo, bandMat);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  arrow.geometry.rotateX(Math.PI / 2); // 錐尖朝 +Z，方便 lookAt
  const aimGroup = new THREE.Group();
  aimGroup.add(aimLine, bandLine, arrow);
  aimGroup.visible = false;
  aimGroup.renderOrder = 5;
  aimLine.frustumCulled = bandLine.frustumCulled = false;
  scene.add(aimGroup);

  // --- 指標輸入：螢幕座標投影到地面 ---
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const start = new THREE.Vector3(), cur = new THREE.Vector3();
  const aim = { active: false, pointerId: -1, dirX: 0, dirZ: 0, power: 0 };

  function toGround(ev, out) {
    const r = dom.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, out);
  }

  function refreshPull() {
    // 往後拉：推力方向 = 起點 - 目前位置
    const dx = start.x - cur.x, dz = start.z - cur.z;
    const len = Math.hypot(dx, dz);
    aim.power = Math.min(len, P.maxPull) / P.maxPull;
    if (len > 1e-4) { aim.dirX = dx / len; aim.dirZ = dz / len; }
  }

  function endAim() {
    aim.active = false;
    aimGroup.visible = false;
    dom.classList.remove('aiming');
  }

  dom.addEventListener('pointerdown', (ev) => {
    if (aim.active || !canAim() || !toGround(ev, start)) return;
    cur.copy(start);
    aim.active = true; aim.pointerId = ev.pointerId; aim.power = 0;
    dom.setPointerCapture(ev.pointerId);
    dom.classList.add('aiming');
  });
  dom.addEventListener('pointermove', (ev) => {
    if (!aim.active || ev.pointerId !== aim.pointerId) return;
    if (toGround(ev, cur)) refreshPull();
  });
  const release = (ev) => {
    if (!aim.active || ev.pointerId !== aim.pointerId) return;
    const fire = ev.type === 'pointerup' && aim.power >= P.minPower && canAim();
    endAim();
    if (!fire) return;
    // 放開：朝拉動反方向施加瞬間衝量（先清掉水平速度讓手感一致）
    const speed = aim.power * P.maxLaunchSpeed, m = body.mass();
    body.setLinvel({ x: 0, y: Math.min(0, body.linvel().y), z: 0 }, true);
    body.applyImpulse({ x: aim.dirX * speed * m, y: 0, z: aim.dirZ * speed * m }, true);
    onLaunch?.(aim.power);
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);

  const powerColor = new THREE.Color(), cLow = new THREE.Color(0x7dffb0), cHigh = new THREE.Color(0xff5a5a);
  const look = new THREE.Vector3();

  function updateAim() {
    if (!aim.active || aim.power < P.minPower) { aimGroup.visible = false; return; }
    aimGroup.visible = true;
    const p = body.translation();
    const len = aim.power * P.aimLength;
    let dx = aim.dirX, dz = aim.dirZ;

    // 用物理射線預測第一次碰撞與反彈方向
    const hit = world.castRayAndGetNormal(new RAPIER.Ray({ x: p.x, y: P.radius, z: p.z }, { x: dx, y: 0, z: dz }), len, true, undefined, undefined, undefined, body);
    const pts = [p.x, AIM_Y, p.z];
    let ex, ez;
    if (hit && hit.timeOfImpact > 0.05) {
      const d1 = Math.max(0.1, hit.timeOfImpact - P.radius * 0.5);
      const hx = p.x + dx * d1, hz = p.z + dz * d1;
      const nl = Math.hypot(hit.normal.x, hit.normal.z) || 1, nx = hit.normal.x / nl, nz = hit.normal.z / nl;
      const dot = dx * nx + dz * nz;
      dx -= 2 * dot * nx; dz -= 2 * dot * nz;
      const rest = Math.max(0.6, (len - d1) * 0.6);
      pts.push(p.x + aim.dirX * d1 * 0.5, AIM_Y, p.z + aim.dirZ * d1 * 0.5, hx, AIM_Y, hz);
      ex = hx + dx * rest; ez = hz + dz * rest;
    } else {
      pts.push(p.x + dx * len * 0.33, AIM_Y, p.z + dz * len * 0.33, p.x + dx * len * 0.66, AIM_Y, p.z + dz * len * 0.66);
      ex = p.x + dx * len; ez = p.z + dz * len;
    }
    pts.push(ex, AIM_Y, ez);
    aimGeo.setPositions(pts);
    aimLine.computeLineDistances();

    arrow.position.set(ex, AIM_Y, ez);
    arrow.lookAt(look.set(ex + dx, AIM_Y, ez + dz));

    const pull = aim.power * P.maxPull * 0.5;
    bandGeo.setPositions([p.x, AIM_Y, p.z, p.x - aim.dirX * pull, AIM_Y, p.z - aim.dirZ * pull]);

    powerColor.copy(cLow).lerp(cHigh, aim.power);
    aimMat.color.copy(powerColor);
    arrow.material.color.copy(powerColor);
  }

  const prevVel = { x: 0, y: 0, z: 0 };
  return {
    body, mesh, aim, prevVel,
    preStep() { const v = body.linvel(); prevVel.x = v.x; prevVel.y = v.y; prevVel.z = v.z; },
    sync() {
      const p = body.translation();
      mesh.position.copy(p);
      mesh.quaternion.copy(body.rotation());
      marker.position.set(p.x, 0.03, p.z);
      marker.visible = p.y > 0 && p.y < 4 && Math.hypot(p.x, p.z) < CFG.arena.radius;
      updateAim();
    },
    respawn() {
      endAim();
      body.setTranslation({ ...P.spawn }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
  };
}
