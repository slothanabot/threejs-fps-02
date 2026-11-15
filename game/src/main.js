// HILLBREAK — Dustline Yard. Boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. main.js owns the match flow (buy phase, rounds, capture,
// respawns), the player's shots, and the grenades; the modules own their own jobs.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeapon, createGrenade, WEAPONS, GRENADE_PRICE, VEST_PRICE, GRENADE_MAX } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createMatch, resetRound, pushFeed, CAPTURE_TARGET, ROUND_SECONDS, BUY_SECONDS, ROUNDS_TO_WIN, RESPAWN_TICKETS, RESPAWN_DELAY } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera);
const bots = createBots(scene, world);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 95;
const shootables = world.shootables.concat(bots.hitMeshes);

const match = createMatch();
const body = player.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let started = false;
let frozen = false;
let shake = 0;
let fov = 74;
let prevFiring = false;
let playerRespawnAt = 0;
let captureTickAt = 0;
const grenades = [];
const grenadeMeshes = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.5, metalness: 0.5 });

// The player as a fighter the bots can see and shoot.
const playerFighter = {
  position: body.position,
  team: 'vanguard',
  isPlayer: true,
  get alive() { return body.alive; },
};

function fighters() {
  const list = [playerFighter];
  for (const bot of bots.bots) list.push(bot);
  return list;
}

function aliveCount(team) {
  let n = 0;
  for (const f of fighters()) if (f.team === team && f.alive) n += 1;
  return n;
}

function teamInZone(team) {
  let n = 0;
  for (const f of fighters()) {
    if (f.team !== team || !f.alive) continue;
    const dx = f.position.x;
    const dz = f.position.z;
    if (dx * dx + dz * dz < world.hillRadius * world.hillRadius) n += 1;
  }
  return n;
}

function buyItem(id) {
  if (match.phase !== 'buy') return;
  if (id === 'grenade') {
    if (weapon.state.grenades >= GRENADE_MAX) { audio.denied(); return; }
    if (match.money < GRENADE_PRICE) { audio.denied(); return; }
    match.money -= GRENADE_PRICE;
    weapon.state.grenades += 1;
  } else if (id === 'vest') {
    if (body.armor >= 50) { audio.denied(); return; }
    if (match.money < VEST_PRICE) { audio.denied(); return; }
    match.money -= VEST_PRICE;
    body.armor = 50;
  } else {
    const def = WEAPONS[id];
    if (!def || weapon.state.id === id) { audio.denied(); return; }
    if (match.money < def.price) { audio.denied(); return; }
    match.money -= def.price;
    weapon.equip(id);
  }
  audio.buy();
  hud.setMoney(match.money);
  hud.setBuyAfford(match.money, weapon.state.id);
  hud.setWeapon(weapon.def().name, weapon.state.grenades);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(body.health, body.armor);
}

function startRound() {
  resetRound(match);
  bots.resetAll();
  weapon.refill();
  weapon.state.grenades = 0;
  const spawn = world.spawns.vanguard[0];
  player.respawn(spawn[0], spawn[1], 0); // yaw 0 faces -z, toward the hill from the south spawn
  for (const g of grenadeMeshes) scene.remove(g);
  grenadeMeshes.length = 0;
  grenades.length = 0;
  hud.showBuy(started); // before the first click the start overlay covers the menu
  hud.setMoney(match.money);
  hud.setBuyAfford(match.money, weapon.state.id);
  hud.showBanner(match.banner, match.bannerSub, 3000);
  syncHud();
}

function startMatch() {
  match.round = 1;
  match.roundsWon.vanguard = 0;
  match.roundsWon.ember = 0;
  match.money = 800;
  match.kills = 0;
  match.deaths = 0;
  match.feed.length = 0;
  match.matchWinner = null;
  weapon.equip('pistol');
  startRound();
}

function endRound(winner, reason) {
  match.phase = 'roundEnd';
  match.phaseTime = 4.5;
  match.winner = winner;
  if (winner) {
    match.roundsWon[winner] += 1;
    const bonus = winner === 'vanguard' ? 1400 : 1000;
    match.money += bonus;
    pushFeed(match, winner === 'vanguard' ? `Vanguard takes round ${match.round} — ${reason}` : `Ember takes round ${match.round} — ${reason}`, winner);
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    hud.showBanner(
      winner === 'vanguard' ? `ROUND ${match.round} — VANGUARD` : `ROUND ${match.round} — EMBER`,
      `${reason} · +$${bonus} ${winner === 'vanguard' ? 'for the round win' : 'for the round loss'}`,
      4200,
    );
  } else {
    pushFeed(match, `Round ${match.round} drawn — ${reason}`, null);
    hud.showBanner(`ROUND ${match.round} — DRAW`, reason, 4200);
  }
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showBuy(false);
  syncHud();
}

function endMatch(winner) {
  match.phase = 'matchEnd';
  match.matchWinner = winner;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showBuy(false);
  hud.showOverlay('match', {
    title: winner === 'vanguard' ? 'VICTORY — DUSTLINE IS YOURS' : 'DEFEAT — EMBER HOLDS THE YARD',
    copy: winner === 'vanguard'
      ? `Vanguard takes the match ${match.roundsWon.vanguard}–${match.roundsWon.ember}. ${match.kills} kills, ${match.deaths} deaths.`
      : `Ember takes the match ${match.roundsWon.ember}–${match.roundsWon.vanguard}. ${match.kills} kills, ${match.deaths} deaths.`,
  });
  if (winner === 'vanguard') audio.roundWin();
  else audio.roundLose();
}

function nextAfterRound() {
  if (match.roundsWon.vanguard >= ROUNDS_TO_WIN) { endMatch('vanguard'); return; }
  if (match.roundsWon.ember >= ROUNDS_TO_WIN) { endMatch('ember'); return; }
  match.round += 1;
  startRound();
}

function killFighter(target, killerName, isHead) {
  if (target.isPlayer) {
    match.deaths += 1;
    pushFeed(match, `${killerName} ▸ You${isHead ? ' (headshot)' : ''}`, 'ember');
    hud.setScore(match.kills, match.deaths);
    if (match.tickets.vanguard > 0) {
      match.tickets.vanguard -= 1;
      playerRespawnAt = elapsed + RESPAWN_DELAY;
      hud.showBanner('ELIMINATED', `Respawning in ${RESPAWN_DELAY}s — ${match.tickets.vanguard} tickets left`, 2400);
    } else {
      hud.showBanner('ELIMINATED', 'No respawn tickets left — your squad fights on', 2400);
    }
    return;
  }
  // The caller already applied the killing damage; this only books the respawn.
  target.respawnAt = elapsed + RESPAWN_DELAY;
  pushFeed(match, `${killerName} ▸ ${target.name}${isHead ? ' (headshot)' : ''}`, target.team === 'ember' ? 'ember' : 'vanguard');
}

// A bot's shot, resolved by main.js so the damage, the tracer and the sound stay in one place.
function botShoot(bot, target, damage, isHead, dist) {
  tmpV.set(bot.position.x, bot.position.y + 1.35, bot.position.z);
  tmpW.set(target.position.x, target.position.y + 1.2, target.position.z);
  effects.tracer(tmpV, tmpW);
  audio.enemyShot(dist);
  bots.hearShot(bot.position, bot.team, elapsed);
  if (target.isPlayer) {
    const before = body.health;
    player.damage(damage);
    audio.hurt();
    hud.damageFlash();
    const angle = Math.atan2(bot.position.x - body.position.x, bot.position.z - body.position.z) * 180 / Math.PI;
    effects.damageFrom(angle - body.yaw * 180 / Math.PI);
    hud.setHealth(body.health, body.armor);
    if (before > 0 && !body.alive) killFighter(target, bot.name, isHead);
  } else {
    const killed = bots.damage(target, damage);
    if (killed) killFighter(target, bot.name, isHead);
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  muzzle.set(0.26, -0.22, -1.0);
  camera.localToWorld(muzzle);
  const end = hit ? hit.point : tmpW.copy(camera.position).addScaledVector(direction, 90);
  effects.tracer(muzzle, end);
  audio.shot(weapon.state.id);
  bots.hearShot(body.position, 'vanguard', elapsed);
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const def = weapon.def();
      const isHead = hit.object.userData.part === 'head';
      const dmg = Math.round(def.damage * (isHead ? def.headMult : 1));
      const killed = bots.damage(bot, dmg);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
      if (killed) {
        match.kills += 1;
        match.money += 300;
        pushFeed(match, `You ▸ ${bot.name}${isHead ? ' (headshot)' : ''}`, 'ember');
        hud.setScore(match.kills, match.deaths);
        hud.setMoney(match.money);
        hud.setBuyAfford(match.money, weapon.state.id);
        bot.respawnAt = elapsed + RESPAWN_DELAY;
      }
    } else {
      effects.burst(hit.point, 6, 2.5);
    }
  }
  weapon.pullTrigger();
  player.recoil(weapon.def().recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0 || match.phase !== 'fight') return;
  weapon.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const origin = tmpV.copy(camera.position).addScaledVector(direction, 0.5);
  const grenade = createGrenade(origin, direction, world.colliders);
  grenades.push(grenade);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(grenade.position);
  scene.add(mesh);
  grenadeMeshes.push(mesh);
  hud.setWeapon(weapon.def().name, weapon.state.grenades);
  audio.shot('pistol');
}

function explodeGrenade(index) {
  const grenade = grenades[index];
  const mesh = grenadeMeshes[index];
  effects.explosion(grenade.position);
  audio.explosion();
  shake = 0.5;
  for (const f of fighters()) {
    if (!f.alive) continue;
    const chest = tmpV.set(f.position.x, f.position.y + 1.2, f.position.z);
    const dmg = grenade.damageAt(chest);
    if (dmg <= 0) continue;
    if (f.isPlayer) {
      player.damage(dmg);
      hud.damageFlash();
      audio.hurt();
      hud.setHealth(body.health, body.armor);
      if (!body.alive) killFighter(f, 'Frag grenade', false);
    } else {
      const killed = bots.damage(f, dmg);
      if (killed) {
        f.respawnAt = elapsed + RESPAWN_DELAY;
        pushFeed(match, `Frag grenade ▸ ${f.name}`, f.team === 'ember' ? 'ember' : 'vanguard');
        if (f.team === 'ember') {
          match.kills += 1;
          match.money += 300;
          hud.setScore(match.kills, match.deaths);
          hud.setMoney(match.money);
        }
      }
    }
  }
  scene.remove(mesh);
  grenades.splice(index, 1);
  grenadeMeshes.splice(index, 1);
}

function syncCamera() {
  const shakeX = shake > 0 ? (random() - 0.5) * shake * 0.06 : 0;
  const shakeY = shake > 0 ? (random() - 0.5) * shake * 0.06 : 0;
  camera.position.set(body.position.x + shakeX, body.position.y + body.eye + shakeY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncHud() {
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.def().name, weapon.state.grenades);
  hud.setMoney(match.money);
  hud.setCapture(match.capture.vanguard, match.capture.ember, match.holder, match.contested);
  hud.setTimer(match.phase === 'buy' ? match.phaseTime : match.phase === 'fight' ? match.roundTimeLeft : match.phaseTime, match.phase);
  hud.setRounds(match.roundsWon.vanguard, match.roundsWon.ember, match.round);
  hud.setScore(match.kills, match.deaths);
  hud.pushFeed(match.feed);
  const entries = [{ name: 'You', team: 'vanguard', alive: body.alive, health: body.health }];
  for (const bot of bots.bots) entries.push({ name: bot.name, team: bot.team, alive: bot.alive, health: bot.health });
  hud.setTeamList(entries);
  const spreadPx = 5 + weapon.spread(player.groundSpeed(), body.crouching) * 900;
  hud.setCrosshairGap(Math.round(spreadPx));
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (match.phase === 'matchEnd') {
    // overlay already shown by endMatch
  } else if (match.phase === 'buy') {
    // Esc during buy: cursor free again, keep buying.
    hud.showBuy(true);
  } else if (match.phase === 'fight') {
    hud.showBuy(false);
    hud.showOverlay('paused');
  } else if (match.phase === 'roundEnd') {
    // The round-end banner speaks for itself; no paused overlay.
  } else if (!started) {
    hud.showOverlay('start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === 'matchEnd') {
    hud.hideOverlay();
    startMatch();
    input.requestLock();
    return;
  }
  if (match.phase === 'buy') {
    // Buy with a free cursor; the deploy click below locks the pointer.
    hud.hideOverlay();
    hud.showBuy(true);
    started = true;
    return;
  }
  input.requestLock();
});
hud.buildBuyList((id) => buyItem(id));

// Deploy: the buy panel's button (or Enter) locks the pointer and fights.
document.getElementById('deploy').addEventListener('click', () => {
  if (shot) return;
  hud.showBuy(false);
  input.requestLock();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && match.phase === 'buy' && !shot) {
    hud.showBuy(false);
    input.requestLock();
  }
});

function step(dt) {
  elapsed += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 1.4);

  if (match.phase === 'buy') {
    match.phaseTime -= dt;
    if (match.phaseTime <= 0) {
      match.phase = 'fight';
      match.phaseTime = 0;
      hud.showBuy(false);
      hud.showBanner('HILL OPEN', 'First to 100 capture points takes the round', 2600);
      if (!input.state.locked && !shot) hud.showOverlay('paused');
    }
  } else if (match.phase === 'fight') {
    match.roundTimeLeft -= dt;
    // Capture: count each team on the hill.
    const v = teamInZone('vanguard');
    const e = teamInZone('ember');
    match.contested = v > 0 && e > 0;
    match.holder = match.contested ? null : v > 0 ? 'vanguard' : e > 0 ? 'ember' : null;
    if (match.holder) {
      const holders = match.holder === 'vanguard' ? v : e;
      const rate = Math.min(3.0, 2.0 + 0.5 * (holders - 1));
      match.capture[match.holder] += rate * dt;
      if (match.holder === 'vanguard') {
        match.money += 3 * dt;
        if (elapsed >= captureTickAt) {
          captureTickAt = elapsed + 1;
          audio.captureTick();
        }
      }
      if (match.capture[match.holder] >= CAPTURE_TARGET) {
        endRound(match.holder, 'hill captured — 100 points');
        return;
      }
    }
    // Respawn the player (a ticket was already spent when they died).
    if (!body.alive && playerRespawnAt > 0 && elapsed >= playerRespawnAt) {
      playerRespawnAt = 0;
      const spawn = world.spawns.vanguard[Math.floor(random() * 3)];
      player.respawn(spawn[0], spawn[1], 0);
      weapon.refill();
    }
    // Respawn bots whose tickets remain.
    for (const bot of bots.bots) {
      if (!bot.alive && bot.respawnAt > 0 && elapsed >= bot.respawnAt) {
        bot.respawnAt = 0;
        const tickets = match.tickets[bot.team];
        if (tickets > 0) {
          match.tickets[bot.team] = tickets - 1;
          const spawns = world.spawns[bot.team];
          const spawn = spawns[bots.bots.indexOf(bot) % spawns.length];
          bot.position.set(spawn[0], 0, spawn[1]);
          bot.velocity.set(0, 0, 0);
          bot.health = 100;
          bot.alive = true;
          bot.state = 'advance';
          bot.node = -1;
          bot.group.rotation.set(0, bot.yaw, 0);
          bot.group.position.copy(bot.position);
          bot.group.visible = true;
        }
      }
    }
    // Wipe: a team with nobody alive and no tickets left loses the round.
    for (const team of ['vanguard', 'ember']) {
      if (aliveCount(team) === 0 && match.tickets[team] <= 0) {
        endRound(team === 'vanguard' ? 'ember' : 'vanguard', `${team === 'vanguard' ? 'Vanguard' : 'Ember'} wiped out`);
        return;
      }
    }
    if (match.roundTimeLeft <= 0) {
      const vCap = match.capture.vanguard;
      const eCap = match.capture.ember;
      if (vCap > eCap) endRound('vanguard', 'time — further ahead on the hill');
      else if (eCap > vCap) endRound('ember', 'time — further ahead on the hill');
      else {
        const vAlive = aliveCount('vanguard');
        const eAlive = aliveCount('ember');
        if (vAlive > eAlive) endRound('vanguard', 'time — more fighters standing');
        else if (eAlive > vAlive) endRound('ember', 'time — more fighters standing');
        else endRound(null, 'time — dead even');
      }
      return;
    }
  } else if (match.phase === 'roundEnd') {
    match.phaseTime -= dt;
    if (match.phaseTime <= 0) nextAfterRound();
  }

  // Simulation: player, weapon, bots, grenades, effects.
  player.step(dt, input.state.keys);
  weapon.step(dt);
  if (match.phase === 'fight') {
    bots.step(dt, elapsed, fighters(), botShoot, effects, audio);
  }
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    grenades[i].step(dt);
    grenadeMeshes[i].position.copy(grenades[i].position);
    if (grenades[i].done) explodeGrenade(i);
  }
  effects.step(dt);
  effects.stepIndicator(dt);
  // Beacon follows the holder: teal for Vanguard, rust for Ember, amber when open.
  const beaconColor = match.holder === 'vanguard' ? PALETTE.teal : match.holder === 'ember' ? PALETTE.rust : PALETTE.accent;
  world.beaconRing.material.color.set(beaconColor);
  world.beaconLight.color.set(beaconColor);
  world.zoneRing.material.color.set(beaconColor);
  world.zoneRing.material.opacity = match.contested ? 0.35 + 0.3 * Math.sin(elapsed * 8) : 0.65;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && started) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const def = weapon.def();
    weapon.state.scoped = input.state.aiming && def.scoped === true && input.state.locked;
    const targetFov = weapon.state.scoped ? 38 : 74;
    fov += (targetFov - fov) * Math.min(1, dt * 10);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const firing = input.state.firing && input.state.locked && body.alive && match.phase === 'fight';
    if (firing && weapon.ready()) {
      if (def.auto || !prevFiring) shoot(shot ? 0 : weapon.spread(player.groundSpeed(), body.crouching));
    }
    prevFiring = input.state.firing;
    for (const code of input.takePressed()) {
      if (code === 'KeyR' && body.alive) { weapon.reload(); audio.reload(); }
      if (code === 'KeyG') {
        if (match.phase === 'buy') buyItem('grenade');
        else if (body.alive) throwGrenade();
      }
      if (match.phase === 'buy') {
        if (code === 'Digit1') buyItem('pistol');
        if (code === 'Digit2') buyItem('smg');
        if (code === 'Digit3') buyItem('rifle');
        if (code === 'Digit4') buyItem('marksman');
        if (code === 'KeyV') buyItem('vest');
      }
      if (code === 'KeyB' && match.phase === 'buy') hud.showBuy(true);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  startMatch();
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  if (name === 'start') {
    body.position.set(0.6, 0, 8.6);
    body.yaw = 0; // face -z, toward the hill
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'play') {
    match.phase = 'fight';
    match.phaseTime = 0;
    weapon.equip('rifle');
    weapon.state.grenades = 1;
    // Stage the player on the south sniper perch, overlooking the hill, while the bots
    // fight for it for six seconds. The player may die standing still; bring them back
    // alive for the frame, with the capture bar mid-contest.
    body.position.set(0, 2.2, 17.5);
    body.yaw = -0.05;
    body.pitch = -0.02;
    settle(60 * 6);
    if (!body.alive) {
      player.respawn(0, 17.5, -0.05);
      body.position.y = 2.2;
      playerRespawnAt = 0;
    }
    match.capture.vanguard = 42;
    match.capture.ember = 27;
    match.holder = 'vanguard';
    match.contested = false;
    document.getElementById('banner').classList.remove('on');
    syncCamera();
    const hill = new THREE.Vector3(0, 1.4, -2);
    tmpV.subVectors(hill, camera.position);
    body.yaw = Math.atan2(-tmpV.x, -tmpV.z);
    body.pitch = Math.asin(tmpV.y / tmpV.length());
    syncCamera();
    shoot(0);
    settle(6);
    shoot(0);
    settle(6);
    hud.setCapture(match.capture.vanguard, match.capture.ember, 'vanguard', false);
  } else {
    // end: a round just won, the round-end banner up.
    match.phase = 'fight';
    match.capture.vanguard = 97;
    match.capture.ember = 61;
    body.position.set(-3, 0, 9);
    body.yaw = -0.2; // face -z, toward the hill
    weapon.equip('rifle');
    settle(60 * 4);
    match.capture.vanguard = 100;
    endRound('vanguard', 'hill captured — 100 points');
    // The player may have died during the fight; bring them back for the frame.
    if (!body.alive) {
      player.respawn(-3, 9, -0.2);
      playerRespawnAt = 0;
    }
    settle(30);
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startMatch();
syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
