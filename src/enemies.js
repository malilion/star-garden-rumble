import * as THREE from 'three';
import { CFG } from './config.js';

const ACCEL = 14; // 追擊水晶時的最大水平加速度

/** 敵人生成池：依類型重複利用剛體與 Mesh，避免頻繁建立 / 銷毀 WASM 物件。 */
export class EnemyPool {
  constructor(RAPIER, world, scene, registry) {
    Object.assign(this, { RAPIER, world, scene, registry });
    this.active = [];
    this.free = {};
    this.geo = {};
    this.mat = {};
    this.eyeGeo = new THREE.SphereGeometry(1, 6, 4);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1040 });
    for (const [key, t] of Object.entries(CFG.enemies.types)) {
      this.free[key] = [];
      this.geo[key] = new THREE.IcosahedronGeometry(t.radius, 1);
      this.mat[key] = new THREE.MeshStandardMaterial({ color: t.color, flatShading: true, roughness: 0.6 });
    }
  }

  _create(key) {
    const { RAPIER, world } = this;
    const cfg = CFG.enemies.types[key];
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.15).setAngularDamping(0.3).setCcdEnabled(true));
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(cfg.radius).setDensity(cfg.density).setRestitution(0.6).setFriction(0.8).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const mesh = new THREE.Mesh(this.geo[key], this.mat[key]);
    mesh.castShadow = true;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(this.eyeGeo, this.eyeMat);
      eye.scale.setScalar(cfg.radius * 0.17);
      eye.position.set(sx * cfg.radius * 0.35, cfg.radius * 0.3, cfg.radius * 0.88);
      mesh.add(eye);
    }
    this.scene.add(mesh);
    const e = { key, cfg, body, collider, mesh, active: false, stun: 0, hitCd: 0, punch: 0, speed: cfg.speed, prevVel: { x: 0, y: 0, z: 0 } };
    this.registry.set(collider.handle, { kind: 'enemy', ref: e });
    return e;
  }

  /** 在浮島外圈隨機角度生成一隻敵人。 */
  spawn(key, speedBonus = 0) {
    const e = this.free[key].pop() ?? this._create(key);
    const a = Math.random() * Math.PI * 2, r = CFG.enemies.spawnRadius;
    e.body.setEnabled(true);
    e.body.setTranslation({ x: Math.cos(a) * r, y: e.cfg.radius + 1.2, z: Math.sin(a) * r }, true);
    e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    e.active = true;
    e.stun = 0.3; e.hitCd = 0; e.punch = 1;
    e.speed = e.cfg.speed + speedBonus;
    e.mesh.visible = true;
    this.active.push(e);
    return e;
  }

  release(e) {
    if (!e.active) return;
    e.active = false;
    e.body.setEnabled(false);
    e.mesh.visible = false;
    this.active.splice(this.active.indexOf(e), 1);
    this.free[e.key].push(e);
  }

  releaseAll() {
    while (this.active.length) this.release(this.active[0]);
  }

  /** 物理步進前呼叫：記錄碰撞前速度並施加朝向水晶的滾動推力。 */
  preStep(dt) {
    for (const e of this.active) {
      const v = e.body.linvel(), p = e.body.translation();
      e.prevVel.x = v.x; e.prevVel.y = v.y; e.prevVel.z = v.z;
      e.stun -= dt; e.hitCd -= dt;
      if (e.stun > 0 || p.y > e.cfg.radius + 0.25 || p.y < 0) continue;
      const d = Math.hypot(p.x, p.z) || 1;
      let dx = (-p.x / d) * e.speed - v.x, dz = (-p.z / d) * e.speed - v.z;
      const len = Math.hypot(dx, dz), max = ACCEL * dt;
      if (len > max) { dx *= max / len; dz *= max / len; }
      const m = e.body.mass();
      e.body.applyImpulse({ x: dx * m, y: 0, z: dz * m }, true);
    }
  }

  /** 同步 Mesh 與剛體座標。 */
  sync(dt) {
    for (const e of this.active) {
      e.mesh.position.copy(e.body.translation());
      e.mesh.quaternion.copy(e.body.rotation());
      e.punch = Math.max(0, e.punch - dt * 5);
      e.mesh.scale.setScalar(1 + e.punch * 0.35);
    }
  }
}
