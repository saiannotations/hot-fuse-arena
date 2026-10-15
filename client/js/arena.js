// Hot Fuse Arena — Three.js arena scene (100% procedural, original art).
import * as THREE from 'three';

const ARENA_HALF = 20;

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  // Dark slate base with subtle noise.
  g.fillStyle = '#232a3d';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 30 + Math.random() * 22;
    g.fillStyle = `rgb(${v},${v + 6},${v + 16})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // Grid lines.
  g.strokeStyle = 'rgba(255,179,0,0.10)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 512;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke();
  }
  // Center emblem ring.
  g.strokeStyle = 'rgba(255,179,0,0.35)';
  g.lineWidth = 10;
  g.beginPath(); g.arc(256, 256, 120, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createArena(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e1a);
  scene.fog = new THREE.Fog(0x0b0e1a, 45, 110);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Lights.
  scene.add(new THREE.HemisphereLight(0x8fa3ff, 0x1a1410, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.35);
  sun.position.set(24, 34, 14);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x40c4ff, 0.35);
  rim.position.set(-20, 12, -24);
  scene.add(rim);

  // Platform.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_HALF * 2 + 2, 2, ARENA_HALF * 2 + 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.9 })
  );
  ground.position.y = -1;
  scene.add(ground);

  // Glowing edge trim.
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xffb300, emissive: 0xffb300, emissiveIntensity: 0.9,
  });
  const trimGeo = new THREE.BoxGeometry(ARENA_HALF * 2 + 2.4, 0.18, 0.5);
  for (const [x, z, ry] of [
    [0, ARENA_HALF + 1, 0], [0, -ARENA_HALF - 1, 0],
    [ARENA_HALF + 1, 0, Math.PI / 2], [-ARENA_HALF - 1, 0, Math.PI / 2],
  ]) {
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(x, 0.02, z);
    trim.rotation.y = ry;
    scene.add(trim);
  }

  // Low walls (visual boundary; sim clamps movement).
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2c3550, roughness: 0.7, transparent: true, opacity: 0.92,
  });
  const wallGeo = new THREE.BoxGeometry(ARENA_HALF * 2 + 2, 2.2, 0.6);
  for (const [x, z, ry] of [
    [0, ARENA_HALF + 0.9, 0], [0, -ARENA_HALF - 0.9, 0],
    [ARENA_HALF + 0.9, 0, Math.PI / 2], [-ARENA_HALF - 0.9, 0, Math.PI / 2],
  ]) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(x, 1.1, z);
    wall.rotation.y = ry;
    scene.add(wall);
  }

  // Corner pillars with glowing cores — pure decoration.
  const pillarGeo = new THREE.CylinderGeometry(0.9, 1.2, 7, 8);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x39415c, roughness: 0.6 });
  const coreGeo = new THREE.CylinderGeometry(0.35, 0.35, 7.4, 8);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffb300, emissive: 0xffb300, emissiveIntensity: 1.4,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(sx * (ARENA_HALF + 3.4), 3.5, sz * (ARENA_HALF + 3.4));
      scene.add(pillar);
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.copy(pillar.position);
      scene.add(core);
    }
  }

  // Screen shake state.
  let shake = 0;
  const camTarget = new THREE.Vector3(0, 0, 0);
  const desired = new THREE.Vector3(0, 17, 12);

  function addShake(amount) {
    shake = Math.min(1.2, shake + amount);
  }

  function follow(dt, focusX, focusZ, overview) {
    if (overview) {
      camTarget.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-dt * 2));
      desired.lerp(new THREE.Vector3(0, 30, 20), 1 - Math.exp(-dt * 2));
    } else {
      camTarget.x += (focusX - camTarget.x) * (1 - Math.exp(-dt * 5));
      camTarget.z += (focusZ - camTarget.z) * (1 - Math.exp(-dt * 5));
      desired.set(camTarget.x, 17, camTarget.z + 12);
    }
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 1.6;
      camera.position.y += (Math.random() - 0.5) * shake * 1.2;
      camera.position.z += (Math.random() - 0.5) * shake * 1.6;
      shake *= Math.exp(-dt * 5);
    }
    camera.lookAt(camTarget.x, 0.5, camTarget.z);
  }

  function render() {
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer, follow, render, addShake };
}
