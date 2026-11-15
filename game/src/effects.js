// Visual feedback, pooled: nothing is allocated while the game runs. A ring of tracer
// lines (muzzle to hit point), a ring of spark particles for impacts, and one expanding
// explosion shell. The DOM damage indicator is a red arc that points at whoever shot you.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 160;
const SPARK_LIFE = 0.5;

export function createEffects(scene) {
  // Tracers: thin stretched boxes, one per shot, fading over 90 ms.
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  // Sparks: one Points cloud, positions updated in place.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  // Explosion: a shell that grows and fades, plus a point light.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf5e'), transparent: true, opacity: 0, depthWrite: false }),
  );
  shell.visible = false;
  scene.add(shell);
  const boomLight = new THREE.PointLight(new THREE.Color('#ffb45e'), 0, 18, 1.5);
  scene.add(boomLight);
  let shellLife = 0;

  const tmpDir = new THREE.Vector3();
  const tmpMid = new THREE.Vector3();

  function tracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    tmpDir.subVectors(to, from);
    const len = tmpDir.length();
    if (len < 0.1) return;
    tmpMid.addVectors(from, to).multiplyScalar(0.5);
    t.mesh.position.copy(tmpMid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
    t.life = 0.09;
    t.mesh.material.opacity = 0.9;
  }

  function burst(point, count, speed, up = 0.5) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkNext;
      sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      sparkVel[i * 3] = Math.cos(a) * Math.cos(b) * speed;
      sparkVel[i * 3 + 1] = Math.sin(b) * speed + up;
      sparkVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * speed;
      sparkLife[i] = SPARK_LIFE;
    }
  }

  function explosion(point) {
    shell.position.copy(point);
    shell.scale.setScalar(0.5);
    shell.visible = true;
    shellLife = 0.45;
    boomLight.position.copy(point);
    boomLight.position.y += 1;
    boomLight.intensity = 60;
    burst(point, 48, 7, 3);
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = (t.life / 0.09) * 0.9;
    }
    let any = false;
    for (let i = 0; i < SPARKS; i += 1) {
      if (sparkLife[i] <= 0) continue;
      any = true;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] = 0; }
      if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -100; }
    }
    if (any) sparkGeo.attributes.position.needsUpdate = true;
    if (shellLife > 0) {
      shellLife -= dt;
      const k = 1 - shellLife / 0.45;
      shell.scale.setScalar(0.5 + k * 6.5);
      shell.material.opacity = Math.max(0, 0.75 * (1 - k));
      boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (shellLife <= 0) shell.visible = false;
    }
  }

  // Damage direction: a red arc on the screen edge pointing toward the shooter.
  const indicator = document.getElementById('damage-dir');
  let indicatorTimer = 0;
  function damageFrom(angleDeg) {
    if (!indicator) return;
    indicator.style.setProperty('--angle', `${angleDeg}deg`);
    indicator.classList.add('on');
    indicatorTimer = 0.7;
  }
  function stepIndicator(dt) {
    if (indicatorTimer <= 0) return;
    indicatorTimer -= dt;
    if (indicatorTimer <= 0 && indicator) indicator.classList.remove('on');
  }

  return { tracer, burst, explosion, step, damageFrom, stepIndicator };
}
