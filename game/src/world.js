// Dustline Yard: an open-air arena with lanes, corners and sightlines worth playing.
// A raised hill platform at the centre holds the capture zone; two long lanes run down
// each side, a mid wall splits the approaches, crates and sandbag walls make cover, and a
// scaffolding platform at each end gives the sniper a perch over the hill. Every box is
// both a collider (AABB) for movement and a surface a bullet stops on.
//
// The waypoint graph is what the bots walk: nodes at cover and corners, edges between
// nodes with a clear walk. Bots pick the next node toward their goal, so they follow
// routes through the map instead of beelining across open ground.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const ARENA = 44; // half-extent of the playable square, in metres
const HILL_R = 4.5; // capture-zone radius around the hill centre

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {};
  for (const name of ['canvas', 'surface', 'hairline', 'ink', 'muted', 'sand', 'rust', 'teal']) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'sand' ? 0.95 : 0.85,
      metalness: name === 'surface' ? 0.25 : 0.02,
    });
  }
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.55,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[material] ?? accentMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) colliders.push(new THREE.Box3().setFromObject(mesh));
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  // Floor: sand with a darker concrete apron around the hill.
  box(ARENA * 2 + 1.6, 0.4, ARENA * 2 + 1.6, 0, -0.2, 0, 'sand');
  box(15, 0.12, 15, 0, 0.06, 0, 'surface');
  // Perimeter walls, low enough to read the dusk sky over them.
  box(0.6, 3.4, ARENA * 2 + 1.6, -ARENA - 0.5, 1.7, 0, 'surface');
  box(0.6, 3.4, ARENA * 2 + 1.6, ARENA + 0.5, 1.7, 0, 'surface');
  box(ARENA * 2 + 1.6, 3.4, 0.6, 0, 1.7, -ARENA - 0.5, 'surface');
  box(ARENA * 2 + 1.6, 3.4, 0.6, 0, 1.7, ARENA + 0.5, 'surface');

  // The hill: a two-step platform at the centre. Standing on it is standing in the zone.
  box(11, 0.5, 11, 0, 0.25, 0, 'hairline');
  box(7.5, 0.5, 7.5, 0, 0.75, 0, 'surface');
  // The beacon: a pylon whose ring pulses with the team holding the hill.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 3.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.4 }),
  );
  beacon.position.set(0, 2.7, 0);
  beacon.castShadow = true;
  group.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.09, 10, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.set(0, 4.3, 0);
  group.add(beaconRing);
  const beaconLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 30, 26, 1.6);
  beaconLight.position.set(0, 4.6, 0);
  group.add(beaconLight);
  // Capture ring on the ground, drawn as a flat ring mesh.
  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(HILL_R - 0.28, HILL_R, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.set(0, 1.03, 0);
  group.add(zoneRing);

  // Mid walls: split the two approaches so neither lane sees straight across the hill.
  box(0.7, 2.2, 7, -9.5, 1.1, 0, 'hairline');
  box(0.7, 2.2, 7, 9.5, 1.1, 0, 'hairline');
  // Crates: low cover on the lanes, tall stacks at the corners.
  const crates = [
    [-5.5, 1.1, -6, 2.2], [5.5, 1.1, -6, 2.2], [-5.5, 1.1, 6, 2.2], [5.5, 1.1, 6, 2.2],
    [-13, 1.1, -9, 2.2], [13, 1.1, -9, 2.2], [-13, 1.1, 9, 2.2], [13, 1.1, 9, 2.2],
    [-2.2, 1.1, -12.5, 1.4], [2.2, 1.1, -12.5, 1.4], [-2.2, 1.1, 12.5, 1.4], [2.2, 1.1, 12.5, 1.4],
  ];
  for (const [x, y, z, s] of crates) box(s, s, s, x, y, z, 'hairline');
  box(2.2, 2.2, 2.2, -13, 3.3, -9, 'surface');
  box(2.2, 2.2, 2.2, 13, 3.3, 9, 'surface');
  // Sandbag walls: crouch cover just off the hill.
  for (const [x, z, w, d] of [[-7.5, -3.5, 3.4, 0.9], [7.5, 3.5, 3.4, 0.9], [-3.5, 7.5, 0.9, 3.4], [3.5, -7.5, 0.9, 3.4]]) {
    box(w, 1.05, d, x, 0.52, z, 'sand');
  }
  // Sniper perches: scaffolding platforms at the north and south ends, reached by a
  // three-step stair (each step 0.55 m, inside the player's jump height) to a 2.2 m deck.
  for (const side of [-1, 1]) {
    const z = side * 17.5;
    box(6, 0.4, 4, 0, 2.0, z, 'surface');
    box(0.35, 2.2, 0.35, -2.8, 1.1, z - 1.8, 'surface');
    box(0.35, 2.2, 0.35, 2.8, 1.1, z - 1.8, 'surface');
    box(0.35, 2.2, 0.35, -2.8, 1.1, z + 1.8, 'surface');
    box(0.35, 2.2, 0.35, 2.8, 1.1, z + 1.8, 'surface');
    const stepZ = z - side * 4.2;
    box(2.4, 0.55, 1.6, 0, 0.275, stepZ + side * 1.6, 'hairline');
    box(2.4, 1.1, 1.6, 0, 0.55, stepZ, 'hairline');
    box(2.4, 1.65, 1.6, 0, 0.825, stepZ - side * 1.6, 'hairline');
  }

  // Light: a low amber sun from the west, a cool teal fill from the east, dusk sky.
  scene.fog = new THREE.Fog(new THREE.Color('#2e3a44'), 30, 95);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#8ba3b5'), new THREE.Color('#4a3d2c'), 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.2);
  sun.position.set(-28, 18, 12);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#4d7d84'), 0.7);
  fill.position.set(20, 12, -14);
  scene.add(fill);

  // Waypoint graph: node positions (x, z) and the neighbours each node walks to.
  const nodes = [
    [0, 0], [-6, 0], [6, 0], [0, -6], [0, 6], [-12, -6], [12, -6], [-12, 6], [12, 6],
    [-6, -12], [6, -12], [-6, 12], [6, 12], [0, -15], [0, 15], [-16, 0], [16, 0],
    [-12, -13], [12, -13], [-12, 13], [12, 13], [0, -19], [0, 19],
  ].map(([x, z]) => ({ x, z, links: [] }));
  function link(a, b) { nodes[a].links.push(b); nodes[b].links.push(a); }
  link(0, 1); link(0, 2); link(0, 3); link(0, 4);
  link(1, 5); link(1, 9); link(2, 6); link(2, 10);
  link(3, 9); link(3, 10); link(3, 13); link(4, 11); link(4, 12); link(4, 14);
  link(5, 15); link(5, 17); link(6, 16); link(6, 18);
  link(7, 11); link(7, 19); link(8, 12); link(8, 20);
  link(9, 17); link(10, 18); link(11, 19); link(12, 20);
  link(13, 21); link(14, 22); link(15, 17); link(15, 19); link(16, 18); link(16, 20);
  link(17, 21); link(18, 21); link(19, 22); link(20, 22);

  return {
    colliders,
    shootables,
    group,
    arena: ARENA,
    hillRadius: HILL_R,
    beaconRing,
    beaconLight,
    zoneRing,
    waypoints: nodes,
    spawns: {
      vanguard: [[-4, 20], [4, 20], [0, 21.5]],
      ember: [[-4, -20], [4, -20], [0, -21.5]],
    },
  };
}
