// Hot Fuse Arena — juice: explosion particles and fuse beeping (WebAudio).
import * as THREE from 'three';

export function createExplosionPool(scene) {
  const bursts = [];
  const geo = new THREE.BufferGeometry();

  function spawn(x, z) {
    const N = 90;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const vels = [];
    const palette = [
      new THREE.Color(0xffd54f), new THREE.Color(0xff9100),
      new THREE.Color(0xff3d00), new THREE.Color(0x9e9e9e),
    ];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = 1;
      positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 9;
      vels.push({
        x: Math.cos(a) * r,
        y: 5 + Math.random() * 11,
        z: Math.sin(a) * r,
      });
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const g = geo.clone();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.42, vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(g, mat);
    scene.add(points);
    bursts.push({ points, vels, life: 1.4 });
  }

  function update(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      const pos = b.points.geometry.attributes.position;
      for (let j = 0; j < b.vels.length; j++) {
        const v = b.vels[j];
        v.y -= 16 * dt; // gravity
        pos.setXYZ(
          j,
          pos.getX(j) + v.x * dt,
          Math.max(0.1, pos.getY(j) + v.y * dt),
          pos.getZ(j) + v.z * dt
        );
      }
      pos.needsUpdate = true;
      b.points.material.opacity = Math.max(0, b.life / 1.4);
      if (b.life <= 0) {
        scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  return { spawn, update };
}

// Beeps that get faster and higher-pitched as the fuse burns down.
export function createBeeper() {
  let ctx = null;
  let lastBeep = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq) {
    const ac = ensure();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.13);
  }

  // Call every frame; beeps only when playing and fuse is live.
  function update(now, fuse, playing) {
    if (!playing || fuse <= 0) return;
    const interval = fuse > 10 ? 1.0 : fuse > 5 ? 0.5 : 0.22;
    if (now - lastBeep >= interval * 1000) {
      lastBeep = now;
      beep(760 + (20 - Math.min(20, fuse)) * 34);
    }
  }

  function unlock() {
    ensure(); // browsers require a user gesture before audio plays
  }

  return { update, unlock };
}
