import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CFG } from './config.js';
import { store } from './store.js';
import { buildArena } from './arena.js';
import { createPlayer } from './player.js';
import { EnemyPool } from './enemies.js';
import { createFx } from './fx.js';
import { initHud } from './hud.js';
import { loadModels } from './models.js';

export async function createGame(canvas) {
  const [models] = await Promise.all([loadModels(), RAPIER.init()]);

  // ---------- Three.js ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a4a);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const camBase = new THREE.Vector3(0, 25, 18);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x4a3a6a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.4);
  sun.position.set(-10, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  scene.add(sun);

  const skyPts = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(90 + Math.random() * 60);
    skyPts.set([v.x, v.y, v.z], i * 3);
  }
  const skyGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(skyPts, 3));
  scene.add(new THREE.Points(skyGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true })));

  // ---------- Rapier ----------
  const world = new RAPIER.World({ x: 0, y: -CFG.gravity, z: 0 });
  const events = new RAPIER.EventQueue(true);
  const registry = new Map(); // collider handle -> { kind, ref }

  const arena = buildArena(RAPIER, world, scene, registry, models);
  const fx = createFx(scene, camera, document.getElementById('popups'));
  const enemies = new EnemyPool(RAPIER, world, scene, registry, models);
  const hud = initHud(restart);
  const player = createPlayer(RAPIER, world, scene, camera, canvas, registry, models, {
    canAim: () => !store.getState().over,
    onLaunch: () => hud.hideHint(),
  });

  let elapsed = 0, spawnTimer = 1, comboTimer = 0;

  function restart() {
    enemies.releaseAll();
    player.respawn();
    store.getState().reset();
    elapsed = 0; spawnTimer = 1; comboTimer = 0;
  }

  // ---------- 生成 ----------
  function spawnTick(dt) {
    const W = CFG.waves, wave = 1 + Math.floor(elapsed / W.duration);
    store.getState().setWave(wave);
    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    spawnTimer += CFG.enemies.spawnInterval;
    const count = 1 + Math.floor((wave - 1) / W.extraSpawnEvery);
    const bruteChance = Math.min(W.bruteChanceMax, W.bruteChanceBase + (wave - 1) * W.bruteChancePerWave);
    for (let i = 0; i < count; i++) {
      enemies.spawn(Math.random() < bruteChance ? 'brute' : 'slime', (wave - 1) * W.speedPerWave);
    }
  }

  // ---------- 碰撞事件 ----------
  const contacts = [];
  const pick = (a, b, kind) => (a.kind === kind ? a : b.kind === kind ? b : null);

  function onPlayerHitsEnemy(e) {
    if (!e.active || e.hitCd > 0) return;
    const pp = player.body.translation(), ep = e.body.translation();
    let nx = ep.x - pp.x, nz = ep.z - pp.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    // 衝擊力：碰撞前沿撞擊法線的相對速度
    const impact = (player.prevVel.x - e.prevVel.x) * nx + (player.prevVel.z - e.prevVel.z) * nz;
    if (impact < CFG.enemies.minImpact) return;

    // 在物理解算結果之上，再追加一個強力排斥衝量（含上挑分量讓敵人飛越圍欄）
    const m = e.body.mass();
    const push = Math.min(impact * e.cfg.knock, 40), lift = Math.min(impact * e.cfg.lift, 9);
    e.body.applyImpulse({ x: nx * push * m, y: lift * m, z: nz * push * m }, true);
    e.stun = CFG.enemies.hitStun; e.hitCd = 0.15; e.punch = 1;

    const combo = store.getState().bumpCombo();
    comboTimer = CFG.combo.resetTime;
    const pts = CFG.score.hit * combo;
    store.getState().addScore(pts);
    const mid = { x: (pp.x + ep.x) / 2, y: ep.y, z: (pp.z + ep.z) / 2 };
    fx.burst(mid, 5 + Math.min(10, impact | 0), 0xffffff, 0.45);
    fx.popup(ep, combo > 1 ? `x${combo}` : `+${pts}`, 'small');
    if (e.cfg.heavy) fx.shake(CFG.shake.heavy * Math.min(1, 0.4 + impact / 25));
  }

  function onEnemyHitsCrystal(e) {
    const s = store.getState();
    if (!e.active || s.over) return;
    const pos = e.body.translation();
    fx.burst(pos, 24, 0x7ff3ff, 0.7);
    fx.popup(pos, '-1 ◆', 'bad');
    fx.shake(CFG.shake.crystal, 0.25);
    arena.crystal.punch = 1;
    enemies.release(e);
    s.damageCrystal();
  }

  function onBumper(bumper, target) {
    const body = target.kind === 'player' ? player.body : target.ref.body;
    const p = body.translation();
    let dx = p.x - bumper.x, dz = p.z - bumper.z;
    const l = Math.hypot(dx, dz) || 1, k = CFG.bumpers.kick * body.mass();
    body.applyImpulse({ x: (dx / l) * k, y: 0, z: (dz / l) * k }, true);
    bumper.punch = 1;
    if (target.kind === 'enemy') target.ref.stun = Math.max(target.ref.stun, 0.35);
  }

  function processContacts() {
    events.drainCollisionEvents((h1, h2, started) => { if (started) contacts.push(h1, h2); });
    for (let i = 0; i < contacts.length; i += 2) {
      const a = registry.get(contacts[i]), b = registry.get(contacts[i + 1]);
      if (!a || !b) continue;
      const enemy = pick(a, b, 'enemy'), isPlayer = pick(a, b, 'player'), bumper = pick(a, b, 'bumper');
      if (enemy && isPlayer) onPlayerHitsEnemy(enemy.ref);
      else if (enemy && pick(a, b, 'crystal')) onEnemyHitsCrystal(enemy.ref);
      else if (bumper && (enemy || isPlayer)) onBumper(bumper.ref, enemy || isPlayer);
    }
    contacts.length = 0;
  }

  // ---------- 擊飛判定 ----------
  function checkFalls() {
    for (let i = enemies.active.length - 1; i >= 0; i--) {
      const e = enemies.active[i], p = e.body.translation();
      if (p.y >= CFG.enemies.killY) continue;
      const s = store.getState();
      if (!s.over) {
        const pts = CFG.score.ringOut * e.cfg.value * Math.max(1, s.combo);
        s.addScore(pts);
        s.addKill();
        fx.popup(p, `+${pts}`, e.cfg.heavy || s.combo >= 3 ? 'big' : '');
      }
      fx.burst(p, e.cfg.heavy ? 70 : 40, 0xffd23f, 1.25);
      enemies.release(e);
    }
    if (player.body.translation().y < CFG.enemies.killY) {
      player.respawn();
      store.getState().resetCombo();
      comboTimer = 0;
    }
  }

  // ---------- 固定步長更新 ----------
  function fixedStep(timeScale) {
    const dt = CFG.fixedDt * timeScale;
    const over = store.getState().over;
    if (!over) { elapsed += dt; spawnTick(dt); }
    player.preStep();
    enemies.preStep(dt);
    world.timestep = dt;
    world.step(events);
    processContacts();
    checkFalls();
    if (comboTimer > 0 && (comboTimer -= dt) <= 0) store.getState().resetCombo();
  }

  function resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.position.copy(camBase).multiplyScalar(Math.max(1, 1.3 / aspect)); // 直式螢幕拉遠
    camera.lookAt(0, 0, 1.2);
    camera.updateProjectionMatrix();
    fx.setCameraBase(camera.position);
  }
  addEventListener('resize', resize);
  resize();

  // ---------- requestAnimationFrame 主循環 ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const timeScale = store.getState().over ? 0.2 : player.aim.active ? CFG.aimTimeScale : 1;
    acc += realDt;
    while (acc >= CFG.fixedDt) { fixedStep(timeScale); acc -= CFG.fixedDt; }

    // 同步 Three.js Mesh 與 Rapier RigidBody
    const dt = realDt * timeScale;
    player.sync();
    enemies.sync(dt);
    arena.update(dt);
    fx.update(dt, realDt);
    hud.setComboFrac(comboTimer / CFG.combo.resetTime);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { world, player, enemies, store, restart };
}
