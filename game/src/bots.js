// Enemy and friendly bots. Four Ember fighters against the player and two Vanguard
// teammates. Each bot has a role that changes how it fights:
//
//   rusher  — SMG, fast, pushes the hill along the waypoint lanes.
//   sniper  — marksman, slow, holds a long sightline and fires rarely but hard.
//   support — rifle, stays near an ally, heals nearby teammates, holds the hill.
//
// Bots walk the waypoint graph toward their goal, hold a position when they get there,
// and react to what they see: a visible enemy triggers a reaction delay, then burst
// fire with strafing; a low-health bot falls back to cover. They hear gunfire too: a
// shot nearby pulls rushers toward it. All movement reuses the same axis-separated
// AABB collision as the player, plus a 0.55 m step-up so bots can climb the hill.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { RESPAWN_DELAY } from './state.js';

const ROLE_STATS = {
  rusher: { speed: 4.6, weapon: 'smg', damage: 13, headChance: 0.08, burst: 4, burstGap: 0.55, reaction: [0.3, 0.55], range: 34, spread: 0.045 },
  sniper: { speed: 3.4, weapon: 'marksman', damage: 52, headChance: 0.18, burst: 1, burstGap: 1.6, reaction: [0.55, 0.9], range: 60, spread: 0.012 },
  support: { speed: 4.0, weapon: 'rifle', damage: 20, headChance: 0.1, burst: 3, burstGap: 0.8, reaction: [0.4, 0.7], range: 44, spread: 0.032 },
};
const NAMES = {
  vanguard: ['Rook', 'Mira'],
  ember: ['Vex', 'Dagger', 'Hawk', 'Sable'],
};
const ROLES = {
  vanguard: ['rusher', 'support'],
  ember: ['rusher', 'rusher', 'sniper', 'support'],
};
// Hold nodes: where each role waits once it reaches the fight.
const HOLD_NODES = { rusher: 0, sniper: 13, support: 3 };

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.55;
const STEP_UP = 0.55;
const GRAVITY = 20;

export function createBots(scene, world, opts) {
  const colliders = world.colliders;
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const teamMat = {
    vanguard: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6 }),
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6 }),
  };
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7 });

  const bots = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const raycaster = new THREE.Raycaster();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  let seedState = 1234567;

  function rand() {
    seedState = (seedState * 1664525 + 1013904223) >>> 0;
    return seedState / 4294967296;
  }

  function buildMesh(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, teamMat[team]);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.14, 0.32, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.14, 0.32, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.2);
    group.add(torso, head, legL, legR, gun);
    return { group, torso, head };
  }

  function spawnBot(team, index) {
    const role = ROLES[team][index];
    const name = NAMES[team][index];
    const parts = buildMesh(team);
    scene.add(parts.group);
    const bot = {
      team, role, name,
      stats: ROLE_STATS[role],
      group: parts.group,
      torso: parts.torso,
      head: parts.head,
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      alive: true,
      state: 'advance',
      node: -1,
      holdNode: HOLD_NODES[role],
      target: null, // fighter currently engaged
      seenAt: 0,
      reactUntil: 0,
      burstLeft: 0,
      nextShotAt: 0,
      strafeDir: 1,
      strafeUntil: 0,
      respawnAt: 0,
      lastHeard: null,
      heardAt: 0,
      walkPhase: rand() * 6,
    };
    parts.torso.userData.part = 'torso';
    parts.head.userData.part = 'head';
    parts.torso.userData.bot = bot;
    parts.head.userData.bot = bot;
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < ROLES.vanguard.length; i += 1) spawnBot('vanguard', i);
  for (let i = 0; i < ROLES.ember.length; i += 1) spawnBot('ember', i);

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function moveBot(bot, dt, wishX, wishZ) {
    const speed = bot.stats.speed * (bot.state === 'retreat' ? 1.1 : 1);
    bot.velocity.x += (wishX * speed - bot.velocity.x) * Math.min(1, 12 * dt);
    bot.velocity.z += (wishZ * speed - bot.velocity.z) * Math.min(1, 12 * dt);
    const p = bot.position;
    // Horizontal move, one axis at a time; if a step blocks the way, try stepping up.
    let nextX = p.x + bot.velocity.x * dt;
    if (overlaps(nextX, p.y, p.z)) {
      if (!overlaps(nextX, p.y + STEP_UP, p.z)) p.y += STEP_UP;
      else bot.velocity.x = 0;
    } else p.x = nextX;
    let nextZ = p.z + bot.velocity.z * dt;
    if (overlaps(p.x, p.y, nextZ)) {
      if (!overlaps(p.x, p.y + STEP_UP, nextZ)) p.y += STEP_UP;
      else bot.velocity.z = 0;
    } else p.z = nextZ;
    // Gravity: settle back onto whatever is underfoot.
    bot.velocity.y -= GRAVITY * dt;
    p.y += bot.velocity.y * dt;
    const hit = overlaps(p.x, p.y, p.z);
    if (hit && bot.velocity.y <= 0) {
      p.y = hit.max.y;
      bot.velocity.y = 0;
    }
    if (p.y < 0) { p.y = 0; bot.velocity.y = 0; }
    bot.velocity.y = Math.max(-30, bot.velocity.y);
  }

  // Line of sight: nothing solid between the bot's eye and the target's chest.
  function canSee(bot, fighter) {
    tmpA.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    tmpB.set(fighter.position.x, fighter.position.y + 1.2, fighter.position.z);
    const dist = tmpA.distanceTo(tmpB);
    if (dist > bot.stats.range) return false;
    tmpC.subVectors(tmpB, tmpA).normalize();
    raycaster.set(tmpA, tmpC);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < world.waypoints.length; i += 1) {
      const n = world.waypoints[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Pick the next waypoint toward the goal: the linked node closest to the goal.
  function nextNodeToward(bot, goalNode) {
    const current = bot.node < 0 ? nearestNode(bot.position.x, bot.position.z) : bot.node;
    const goal = world.waypoints[goalNode];
    let best = current;
    let bestD = Infinity;
    for (const link of world.waypoints[current].links) {
      const n = world.waypoints[link];
      const d = (n.x - goal.x) ** 2 + (n.z - goal.z) ** 2 + rand() * 4;
      if (d < bestD) { bestD = d; best = link; }
    }
    return best;
  }

  function resetBot(bot, spawn) {
    bot.position.set(spawn[0], 0, spawn[1]);
    bot.velocity.set(0, 0, 0);
    bot.yaw = bot.team === 'vanguard' ? 0 : Math.PI; // vanguard faces -z, ember faces +z
    bot.health = 100;
    bot.alive = true;
    bot.state = 'advance';
    bot.node = -1;
    bot.target = null;
    bot.burstLeft = 0;
    bot.group.rotation.set(0, bot.yaw, 0);
    bot.group.position.copy(bot.position);
    bot.group.visible = true;
  }

  function resetAll() {
    for (const bot of bots) {
      const spawns = world.spawns[bot.team];
      const idx = bots.indexOf(bot);
      const teamIdx = bot.team === 'vanguard' ? idx : idx - ROLES.vanguard.length;
      resetBot(bot, spawns[teamIdx % spawns.length]);
    }
  }

  return {
    bots,
    hitMeshes,
    resetAll,
    rand,
    hearShot(point, team, time) {
      // Rushers turn toward nearby gunfire; supports and snipers stay on their job.
      for (const bot of bots) {
        if (!bot.alive || bot.role !== 'rusher') continue;
        const d = bot.position.distanceTo(point);
        if (d < 22) {
          bot.lastHeard = point;
          bot.heardAt = time;
        }
      }
    },
    // One fixed step for every bot. fighters: [{ position, team, alive, isPlayer, damage(), eyeHeight }]
    // shoot: (bot, targetFighter, damage, isHead) — main.js resolves the shot.
    step(dt, time, fighters, shoot, effects, audio) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const stats = bot.stats;
        // Support heals nearby allies, 6 hp/s inside 6 m.
        if (bot.role === 'support') {
          for (const other of bots) {
            if (other === bot || other.team !== bot.team || !other.alive || other.health >= 100) continue;
            if (other.position.distanceTo(bot.position) < 6) other.health = Math.min(100, other.health + 6 * dt);
          }
        }
        // Acquire a target: the nearest visible enemy fighter.
        let target = null;
        let targetDist = Infinity;
        for (const f of fighters) {
          if (f.team === bot.team || !f.alive) continue;
          const d = bot.position.distanceTo(f.position);
          if (d < targetDist && canSee(bot, f)) { target = f; targetDist = d; }
        }
        if (target) {
          if (bot.target !== target) {
            bot.target = target;
            bot.seenAt = time;
            bot.reactUntil = time + stats.reaction[0] + rand() * (stats.reaction[1] - stats.reaction[0]);
            bot.burstLeft = 0;
          }
        } else {
          bot.target = null;
        }

        // Decide the state.
        if (bot.health < 30 && bot.role !== 'sniper') bot.state = 'retreat';
        else if (bot.target) bot.state = 'engage';
        else if (bot.role === 'sniper' && bot.node === bot.holdNode) bot.state = 'hold';
        else bot.state = 'advance';

        let wishX = 0;
        let wishZ = 0;
        if (bot.state === 'engage' && bot.target) {
          // Face the target; strafe sideways, switching direction every second or so.
          tmpA.set(bot.target.position.x - bot.position.x, 0, bot.target.position.z - bot.position.z);
          bot.yaw = Math.atan2(-tmpA.x, -tmpA.z);
          if (time > bot.strafeUntil) {
            bot.strafeDir = rand() < 0.5 ? -1 : 1;
            bot.strafeUntil = time + 0.7 + rand() * 0.8;
          }
          const dist = Math.hypot(tmpA.x, tmpA.z) || 1;
          const want = bot.role === 'sniper' ? 26 : bot.role === 'support' ? 16 : 10;
          const approach = dist > want + 2 ? 1 : dist < want - 2 ? -0.6 : 0;
          wishX = (tmpA.x / dist) * approach + (-tmpA.z / dist) * bot.strafeDir * 0.7;
          wishZ = (tmpA.z / dist) * approach + (tmpA.x / dist) * bot.strafeDir * 0.7;
          // Fire in bursts once the reaction delay has passed.
          if (time >= bot.reactUntil) {
            if (bot.burstLeft <= 0 && time >= bot.nextShotAt) {
              bot.burstLeft = stats.burst;
            }
            if (bot.burstLeft > 0 && time >= bot.nextShotAt) {
              bot.burstLeft -= 1;
              bot.nextShotAt = time + (stats.weapon === 'marksman' ? 0.9 : 0.13);
              if (bot.burstLeft === 0) bot.nextShotAt = time + stats.burstGap;
              const falloff = Math.max(0.55, 1 - Math.max(0, targetDist - 25) * 0.012);
              const isHead = rand() < stats.headChance;
              shoot(bot, bot.target, Math.round(stats.damage * falloff), isHead, targetDist);
            }
          }
        } else if (bot.state === 'retreat') {
          // Fall back toward the team's spawn node.
          const goal = bot.team === 'vanguard' ? 22 : 21;
          bot.node = nextNodeToward(bot, goal);
          const n = world.waypoints[bot.node];
          tmpA.set(n.x - bot.position.x, 0, n.z - bot.position.z);
          const d = Math.hypot(tmpA.x, tmpA.z) || 1;
          wishX = tmpA.x / d;
          wishZ = tmpA.z / d;
          if (d < 1.4) bot.state = 'advance';
          bot.yaw = Math.atan2(-wishX, -wishZ);
          if (bot.health > 75) bot.state = 'advance';
        } else if (bot.state === 'hold') {
          // Sniper on post: scan slowly, waiting for a target.
          bot.yaw += dt * 0.25;
          wishX = 0;
          wishZ = 0;
        } else {
          // Advance: walk the graph toward the role's goal; gunfire heard nearby diverts a rusher.
          let goal = bot.holdNode;
          if (bot.role === 'sniper') goal = bot.team === 'vanguard' ? 14 : 13;
          if (bot.lastHeard && time - bot.heardAt < 3 && bot.role === 'rusher') {
            tmpA.set(bot.lastHeard.x - bot.position.x, 0, bot.lastHeard.z - bot.position.z);
            const d = Math.hypot(tmpA.x, tmpA.z) || 1;
            if (d > 3) {
              wishX = tmpA.x / d;
              wishZ = tmpA.z / d;
              bot.yaw = Math.atan2(-wishX, -wishZ);
            } else {
              bot.lastHeard = null;
            }
          } else {
            if (bot.node < 0) bot.node = nearestNode(bot.position.x, bot.position.z);
            const n = world.waypoints[bot.node];
            tmpA.set(n.x - bot.position.x, 0, n.z - bot.position.z);
            const d = Math.hypot(tmpA.x, tmpA.z) || 1;
            if (d < 1.3) {
              if (bot.node === goal) {
                if (bot.role === 'sniper') bot.state = 'hold';
                else { wishX = 0; wishZ = 0; }
              } else {
                bot.node = nextNodeToward(bot, goal);
              }
            } else {
              wishX = tmpA.x / d;
              wishZ = tmpA.z / d;
              bot.yaw = Math.atan2(-wishX, -wishZ);
            }
          }
        }

        moveBot(bot, dt, wishX, wishZ);
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
        // Walk bob: legs swing while moving.
        const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
        bot.walkPhase += dt * speed * 1.6;
        const swing = Math.sin(bot.walkPhase) * Math.min(0.5, speed * 0.09);
        bot.group.children[2].rotation.x = swing;
        bot.group.children[3].rotation.x = -swing;
      }
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.health = 0;
      bot.alive = false;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      return true;
    },
  };
}
