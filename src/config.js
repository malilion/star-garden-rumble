// 所有可調手感參數集中於此
export const CFG = {
  fixedDt: 1 / 60,
  gravity: 25,
  aimTimeScale: 0.35, // 瞄準時的慢動作倍率

  arena: {
    radius: 12,
    thickness: 1,
    fenceRadius: 11.6,
    fenceHeight: 0.8,
    fenceThickness: 0.35,
    fenceArcs: 6, // 圍欄弧段數；弧段之間即為可擊飛出場的缺口
    fenceArcSpanDeg: 36,
    fenceSegsPerArc: 4,
    fenceRestitution: 0.8,
  },

  crystal: { radius: 1.0, hp: 5, visualScale: 1.6 },

  bumpers: {
    ringRadius: 6,
    count: 3,
    radius: 0.8,
    halfHeight: 0.6,
    visualScale: 1.1, // 蘑菇模型高度的一半
    kick: 9, // 撞上蘑菇獲得的速度增量 (m/s)
  },

  player: {
    radius: 0.6,
    restitution: 0.9,
    friction: 0.4,
    linearDamping: 0.6, // 可調節阻尼
    angularDamping: 0.5,
    maxPull: 7, // 最大拉距（世界單位）
    minPower: 0.08, // 低於此力度視為取消
    maxLaunchSpeed: 30,
    aimLength: 14,
    spawn: { x: 0, y: 1.5, z: 4 },
  },

  enemies: {
    spawnInterval: 3,
    spawnRadius: 9.8,
    killY: -5,
    hitStun: 0.9, // 被撞後暫停追擊的秒數
    minImpact: 2, // 低於此相對速度不算有效撞擊
    types: {
      slime: { model: 1, radius: 0.5, density: 1, speed: 2.2, color: 0xff7ac8, knock: 1.0, lift: 0.3, value: 1, heavy: false },
      brute: { model: 0, radius: 0.85, density: 1.5, speed: 1.5, color: 0x5a4bd6, knock: 0.5, lift: 0.15, value: 3, heavy: true },
    },
  },

  waves: {
    duration: 20, // 每波秒數
    speedPerWave: 0.22,
    bruteChanceBase: 0.1,
    bruteChancePerWave: 0.05,
    bruteChanceMax: 0.45,
    extraSpawnEvery: 3, // 每 N 波，每次刷怪 +1 隻
  },

  combo: { resetTime: 1.5 },
  score: { hit: 10, ringOut: 100 },
  shake: { duration: 0.1, heavy: 0.55, crystal: 0.8 },
};
