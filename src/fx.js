import * as THREE from 'three';
import { CFG } from './config.js';

const MAX_STARS = 900;

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }).center();
}

/** 粒子爆破（InstancedMesh）、螢幕震動、彈跳分數字。 */
export function createFx(scene, camera, popupLayer) {
  // --- Instanced 星星粒子池 ---
  const mesh = new THREE.InstancedMesh(starGeometry(), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), MAX_STARS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  const stars = Array.from({ length: MAX_STARS }, () => ({ life: 0, max: 1, size: 0.2, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: new THREE.Vector3() }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0), color = new THREE.Color();
  for (let i = 0; i < MAX_STARS; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, color); }
  scene.add(mesh);
  let cursor = 0;

  function burst(pos, count, hex = 0xffd23f, power = 1) {
    for (let i = 0; i < count; i++) {
      const st = stars[cursor];
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 7) * power;
      st.p.set(pos.x, pos.y, pos.z);
      st.v.set(Math.cos(a) * sp, (6 + Math.random() * 12) * power, Math.sin(a) * sp);
      st.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      st.max = st.life = 0.7 + Math.random() * 0.8;
      st.size = 0.14 + Math.random() * 0.2;
      color.set(hex).offsetHSL(0, 0, Math.random() * 0.15);
      mesh.setColorAt(cursor, color);
      cursor = (cursor + 1) % MAX_STARS;
    }
    mesh.instanceColor.needsUpdate = true;
  }

  // --- 螢幕震動 ---
  const base = new THREE.Vector3().copy(camera.position);
  let shakeT = 0, shakeDur = 0.1, shakeAmp = 0;
  function shake(amp, dur = CFG.shake.duration) {
    if (amp < shakeAmp * (shakeT / shakeDur)) return;
    shakeAmp = amp; shakeDur = shakeT = dur;
  }

  // --- 彈跳分數字（DOM） ---
  const proj = new THREE.Vector3();
  function popup(pos, text, cls = '') {
    proj.set(pos.x, Math.max(pos.y, 0.5), pos.z).project(camera);
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(94, Math.max(6, (proj.x * 0.5 + 0.5) * 100))}%`;
    el.style.top = `${Math.min(92, Math.max(12, (-proj.y * 0.5 + 0.5) * 100))}%`;
    el.addEventListener('animationend', () => el.remove());
    popupLayer.appendChild(el);
  }

  /** dt 為遊戲時間（受慢動作影響），realDt 為真實時間。 */
  function update(dt, realDt) {
    for (let i = 0; i < MAX_STARS; i++) {
      const st = stars[i];
      if (st.life <= 0) continue;
      st.life -= dt;
      if (st.life <= 0) { mesh.setMatrixAt(i, zero); continue; }
      st.v.y -= CFG.gravity * 0.8 * dt;
      st.p.addScaledVector(st.v, dt);
      st.r.x += st.spin.x * dt; st.r.y += st.spin.y * dt; st.r.z += st.spin.z * dt;
      const k = st.size * Math.min(1, (st.life / st.max) * 3);
      mesh.setMatrixAt(i, m4.compose(st.p, q.setFromEuler(st.r), s.set(k, k, k)));
    }
    mesh.instanceMatrix.needsUpdate = true;

    camera.position.copy(base);
    if (shakeT > 0) {
      shakeT -= realDt;
      const k = shakeAmp * Math.max(0, shakeT / shakeDur);
      camera.position.x += (Math.random() * 2 - 1) * k;
      camera.position.y += (Math.random() * 2 - 1) * k;
      camera.position.z += (Math.random() * 2 - 1) * k * 0.5;
      if (shakeT <= 0) shakeAmp = 0;
    }
  }

  return { burst, shake, popup, update, setCameraBase: (v) => base.copy(v) };
}
