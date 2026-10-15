// Hot Fuse Arena — player meshes, name labels, bomb + crown attachments.
// All art is procedural and original.
import * as THREE from 'three';

function makeLabel(text, colorCss) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Dark pill behind the text for readability.
  const w = Math.min(240, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 14);
  g.fill();
  g.fillStyle = colorCss;
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

function makeCrown() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffd54f, metalness: 0.85, roughness: 0.25, emissive: 0x7a5c00,
    emissiveIntensity: 0.35,
  });
  group.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 10, 20), gold));
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), gold);
    const a = (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.42, 0.22, Math.sin(a) * 0.42);
    group.add(spike);
  }
  return group;
}

function makeBomb() {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.7 })
  );
  group.add(sphere);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.4 })
  );
  cap.position.y = 0.48;
  group.add(cap);
  // Fuse spark: a few bright points jittering above the cap.
  const sparkGeo = new THREE.BufferGeometry();
  const N = 14;
  const pos = new Float32Array(N * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffd54f, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sparks.position.y = 0.62;
  group.add(sparks);
  const light = new THREE.PointLight(0xff6a00, 12, 9, 1.6);
  light.position.y = 0.4;
  group.add(light);
  return { group, sparks, light, sparkSeeds: Array.from({ length: N }, () => Math.random() * 10) };
}

export function createPlayerManager(scene) {
  const meshes = new Map(); // playerId -> { group, body, label, crown, renderX, renderZ }
  const bomb = makeBomb();
  bomb.group.visible = false;
  scene.add(bomb.group);

  function css(color) {
    return '#' + color.toString(16).padStart(6, '0');
  }

  function ensure(id, p) {
    let m = meshes.get(id);
    if (!m) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.5, 0.9, 6, 14),
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55 })
      );
      body.position.y = 0.95;
      group.add(body);
      // Simple visor so players have a "face".
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.22, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x0b0e1a, roughness: 0.2, metalness: 0.4 })
      );
      visor.position.set(0, 1.35, 0.42);
      group.add(visor);
      const label = makeLabel(p.name + (p.isBot ? ' 🤖' : ''), css(p.color));
      label.position.y = 2.55;
      group.add(label);
      const crown = makeCrown();
      crown.position.y = 2.15;
      crown.visible = false;
      group.add(crown);
      group.position.set(p.x, 0, p.z);
      scene.add(group);
      m = { group, body, label, crown, renderX: p.x, renderZ: p.z, visor };
      meshes.set(id, m);
    }
    return m;
  }

  function update(players, dt, time) {
    const seen = new Set();
    let holderMesh = null;
    for (const p of players) {
      seen.add(p.id);
      const m = ensure(p.id, p);
      m.group.visible = p.alive;
      if (!p.alive) continue;
      // Exponential smoothing toward the authoritative position.
      const k = 1 - Math.exp(-dt * 12);
      m.renderX += (p.x - m.renderX) * k;
      m.renderZ += (p.z - m.renderZ) * k;
      m.group.position.set(m.renderX, 0, m.renderZ);
      // Squash-and-stretch bounce while running.
      const speed = Math.hypot(p.x - m.renderX, p.z - m.renderZ);
      const bounce = Math.min(1, speed * 2);
      m.body.scale.y = 1 + Math.sin(time * 14) * 0.06 * bounce;
      m.body.position.y = 0.95 + Math.abs(Math.sin(time * 14)) * 0.09 * bounce;
      if (p.hasBomb) holderMesh = m;
    }
    // Remove meshes for players who left.
    for (const [id, m] of meshes) {
      if (!seen.has(id)) {
        scene.remove(m.group);
        meshes.delete(id);
      }
    }
    // Bomb floats above the holder's head, pulsing with urgency.
    if (holderMesh) {
      bomb.group.visible = true;
      const bob = Math.sin(time * 6) * 0.08;
      bomb.group.position.set(holderMesh.renderX, 2.05 + bob, holderMesh.renderZ);
      const s = 1 + Math.sin(time * 9) * 0.07;
      bomb.group.scale.set(s, s, s);
      bomb.light.intensity = 10 + Math.sin(time * 9) * 5;
      // Animate sparks.
      const pos = bomb.sparks.geometry.attributes.position;
      for (let i = 0; i < bomb.sparkSeeds.length; i++) {
        const t = (time * 2.4 + bomb.sparkSeeds[i]) % 1;
        pos.setXYZ(
          i,
          Math.sin(bomb.sparkSeeds[i] * 20 + time * 9) * 0.16 * t,
          0.35 * t,
          Math.cos(bomb.sparkSeeds[i] * 17 + time * 8) * 0.16 * t
        );
      }
      pos.needsUpdate = true;
    } else {
      bomb.group.visible = false;
    }
  }

  function setWinner(winnerId) {
    for (const [id, m] of meshes) {
      m.crown.visible = id === winnerId;
    }
  }

  function clearWinner() {
    for (const [, m] of meshes) m.crown.visible = false;
  }

  return { update, setWinner, clearWinner };
}
