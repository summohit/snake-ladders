import * as THREE from 'three';
import gsap from 'gsap';
import {
  BOARD_SIZE,
  TILE_SIZE,
  BOARD_SPAN,
  BOARD_HALF,
  BOARD_TOP_Y,
  PLAYERS_META,
  LADDERS,
  SNAKES,
  LADDER_MAP,
  SNAKE_MAP,
  tileToGrid,
  tileToWorld,
  getStackOffset,
  getSnakeCurvePoints,
} from './boardData.js';

const CAMERA_PRESETS = {
  isometric: { pos: [0, 14.8, 12.2], target: [0, 0.2, 0.3] },
  top: { pos: [0, 18.2, 2.2], target: [0, 0, 0] },
  cinematic: { pos: [7.8, 11.4, 12.6], target: [0, 0.3, 0.2] },
};

// Rotations so the requested die face (1..6) faces UP (+Y)
const DICE_FACE_ROTATIONS = {
  1: { x: 0, z: 0 }, // +Y is 1
  2: { x: -Math.PI / 2, z: 0 }, // +Z is 2
  3: { x: 0, z: Math.PI / 2 }, // +X is 3
  4: { x: 0, z: -Math.PI / 2 }, // -X is 4
  5: { x: Math.PI / 2, z: 0 }, // -Z is 5
  6: { x: Math.PI, z: 0 }, // -Y is 6
};

export class JungleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.cameraPreset = 'isometric';
    this.lookTarget = new THREE.Vector3(0, 0.2, 0.3);
    this.disposed = false;

    this.pawns = new Map(); // seatId -> { group, aura, colorHex }
    this.snakeHeads = [];
    this.particles = [];
    this.fireflies = null;
    this.diceGroup = null;
    this.diceMesh = null;
    this.crownHalo = null;
    this.activeSeatId = -1;
    this.scareSnake = null;

    this.initRenderer();
    this.initScene();
    this.initLights();
    this.buildJunglePedestal();
    this.buildBoardTiles();
    this.buildLadders();
    this.buildSnakes();
    this.buildCornerFlora();
    this.buildFireflies();
    this.buildPawns();
    this.build3DDice();
    this.buildJumpScareSnake();

    this.onResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.handleResize();
    this.animate();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.12;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
    const p = CAMERA_PRESETS.isometric;
    this.camera.position.set(...p.pos);
    this.lookTarget.set(...p.target);
    this.camera.lookAt(this.lookTarget);
    // Add camera to scene so camera-attached 3D FX (jump-scare snake) render cleanly
    this.scene.add(this.camera);
  }

  initLights() {
    const hemi = new THREE.HemisphereLight(0xfff9e6, 0x105c3d, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5d6, 1.45);
    sun.position.set(10, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -11;
    sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const emeraldFill = new THREE.DirectionalLight(0x38ffaa, 0.55);
    emeraldFill.position.set(-12, 8, -10);
    this.scene.add(emeraldFill);

    const goldRim = new THREE.PointLight(0xffcb47, 1.6, 26, 1.2);
    goldRim.position.set(0, 5.5, 9.5);
    this.scene.add(goldRim);
  }

  buildJunglePedestal() {
    const group = new THREE.Group();

    // Outer mossy temple slab
    const slabGeo = new THREE.BoxGeometry(BOARD_SPAN + 1.3, 0.72, BOARD_SPAN + 1.3);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x163d2d,
      roughness: 0.72,
      metalness: 0.05,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = -0.14;
    slab.receiveShadow = true;
    group.add(slab);

    // Warm carved wood inner rim
    const rimGeo = new THREE.BoxGeometry(BOARD_SPAN + 0.55, 0.42, BOARD_SPAN + 0.55);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x6b3e1e,
      roughness: 0.58,
      metalness: 0.05,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = 0.05;
    rim.receiveShadow = true;
    group.add(rim);

    // Glowing emerald vine trim around the pedestal
    const ringGeo = new THREE.TorusGeometry(BOARD_HALF * 1.48, 0.08, 12, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2cff9b,
      transparent: true,
      opacity: 0.72,
    });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = -0.45;
    group.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(BOARD_HALF * 1.64, 0.055, 10, 72);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xffd24c,
      transparent: true,
      opacity: 0.45,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -0.5;
    group.add(ring2);

    // Wooden start dock on bottom-left (tile 0 staging area)
    const dockGeo = new THREE.BoxGeometry(1.15, 0.22, 3.1);
    const dockMat = new THREE.MeshStandardMaterial({
      color: 0x7c4924,
      roughness: 0.65,
      metalness: 0.02,
    });
    const dock = new THREE.Mesh(dockGeo, dockMat);
    dock.position.set(-BOARD_HALF - 0.85, BOARD_TOP_Y - 0.26, BOARD_HALF - 1.6);
    dock.receiveShadow = true;
    group.add(dock);

    this.scene.add(group);
  }

  createBoardTexture() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cell = size / BOARD_SIZE;

    // Lush Enchanted Jungle palette for tiles
    const palette = [
      '#1e6b4a', // lush jade
      '#2c8a57', // emerald leaf
      '#d9a13b', // sunlit temple gold
      '#1b7c74', // lagoon teal
      '#399c52', // vibrant canopy
    ];

    for (let tile = 1; tile <= 100; tile++) {
      const { row, col } = tileToGrid(tile);
      const x = col * cell;
      const y = (BOARD_SIZE - 1 - row) * cell;

      // Base tile color
      let bg = palette[(row * 3 + col) % palette.length];
      if (tile === 1) bg = '#159e59';
      if (tile === 100) bg = '#f5b81d';

      const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      grad.addColorStop(0, bg);
      grad.addColorStop(1, this.shadeHex(bg, -20));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cell, cell);

      // Subtle inner stone bevel
      ctx.strokeStyle = 'rgba(255, 248, 214, 0.28)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);

      // Special accents for ladder start / snake head
      if (LADDER_MAP.has(tile)) {
        ctx.fillStyle = 'rgba(69, 255, 158, 0.24)';
        ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16);
        ctx.fillStyle = '#8bffc2';
        ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('▲', x + cell - 16, y + cell - 14);
      } else if (SNAKE_MAP.has(tile)) {
        ctx.fillStyle = 'rgba(255, 59, 92, 0.24)';
        ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16);
        ctx.fillStyle = '#ff859a';
        ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('▼', x + cell - 16, y + cell - 14);
      }

      // Tile number
      ctx.fillStyle = tile === 100 ? '#2b1600' : '#fffdf0';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.font = tile === 100 ? '900 66px "Plus Jakarta Sans", sans-serif' : '800 54px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(tile), x + 18, y + 14);
      ctx.shadowBlur = 0;

      // Special labels for 1 and 100
      if (tile === 1) {
        ctx.fillStyle = '#d9ffea';
        ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('START', x + cell / 2, y + cell - 16);
      } else if (tile === 100) {
        ctx.fillStyle = '#472200';
        ctx.font = '900 52px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('👑', x + cell / 2, y + cell - 10);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  shadeHex(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
  }

  buildBoardTiles() {
    const boardGeo = new THREE.PlaneGeometry(BOARD_SPAN, BOARD_SPAN);
    const boardMat = new THREE.MeshStandardMaterial({
      map: this.createBoardTexture(),
      roughness: 0.55,
      metalness: 0.02,
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.rotation.x = -Math.PI / 2;
    boardMesh.position.y = BOARD_TOP_Y;
    boardMesh.receiveShadow = true;
    this.scene.add(boardMesh);

    // Golden pulsing portal ring on Tile 100
    const p100 = tileToWorld(100);
    const haloGeo = new THREE.TorusGeometry(0.48, 0.05, 12, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffe047,
      transparent: true,
      opacity: 0.9,
    });
    this.crownHalo = new THREE.Mesh(haloGeo, haloMat);
    this.crownHalo.rotation.x = Math.PI / 2;
    this.crownHalo.position.set(p100.x, BOARD_TOP_Y + 0.08, p100.z);
    this.scene.add(this.crownHalo);
  }

  buildLadders() {
    for (const ladder of LADDERS) {
      const start = tileToWorld(ladder.from);
      const end = tileToWorld(ladder.to);
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const angleY = Math.atan2(dx, dz);

      const group = new THREE.Group();
      group.position.set((start.x + end.x) / 2, BOARD_TOP_Y + 0.12, (start.z + end.z) / 2);
      group.rotation.y = angleY;

      const woodMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ladder.wood),
        roughness: 0.52,
        metalness: 0.04,
      });
      const vineMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ladder.glow),
        emissive: new THREE.Color(ladder.glow),
        emissiveIntensity: 0.65,
        roughness: 0.35,
      });

      const railSpacing = 0.26;
      const railGeo = new THREE.CylinderGeometry(0.055, 0.055, length, 10);
      railGeo.rotateX(Math.PI / 2);

      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, woodMat);
        rail.position.x = side * railSpacing;
        rail.castShadow = true;
        group.add(rail);

        // Glowing vine accent strip on top of each rail
        const vineGeo = new THREE.CylinderGeometry(0.022, 0.022, length * 0.92, 6);
        vineGeo.rotateX(Math.PI / 2);
        const vine = new THREE.Mesh(vineGeo, vineMat);
        vine.position.set(side * railSpacing, 0.05, 0);
        group.add(vine);
      }

      // Wooden rungs
      const rungCount = Math.max(4, Math.floor(length / 0.58));
      const rungGeo = new THREE.CylinderGeometry(0.036, 0.036, railSpacing * 2.15, 8);
      rungGeo.rotateZ(Math.PI / 2);
      for (let i = 1; i < rungCount; i++) {
        const t = i / rungCount - 0.5;
        const rung = new THREE.Mesh(rungGeo, woodMat);
        rung.position.set(0, 0.01, t * length);
        rung.castShadow = true;
        group.add(rung);
      }

      this.scene.add(group);
    }
  }

  createSnakeTexture(primary, stripe) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 256, 64);

    // Bold tropical diamond stripes
    ctx.fillStyle = stripe;
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 16, 4);
      ctx.lineTo(x + 28, 32);
      ctx.lineTo(x + 16, 60);
      ctx.lineTo(x + 4, 32);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 1);
    return tex;
  }

  buildSnakes() {
    for (const snake of SNAKES) {
      const rawPts = getSnakeCurvePoints(snake);
      const vecPts = rawPts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(vecPts);

      const tubeGeo = new THREE.TubeGeometry(curve, 44, 0.13, 12, false);
      const tex = this.createSnakeTexture(snake.primary, snake.stripe);
      const bodyMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(snake.primary),
        emissiveIntensity: 0.18,
      });

      const bodyMesh = new THREE.Mesh(tubeGeo, bodyMat);
      bodyMesh.castShadow = true;
      this.scene.add(bodyMesh);

      // Sculpted Snake Head at vecPts[0]
      const headGroup = new THREE.Group();
      const headPos = vecPts[0];
      const nextPos = vecPts[1];
      headGroup.position.copy(headPos);
      headGroup.position.y += 0.05;
      // Face outward (opposite of body direction)
      const dir = new THREE.Vector3().subVectors(headPos, nextPos).normalize();
      headGroup.lookAt(headPos.clone().add(dir));

      const headMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(snake.primary),
        roughness: 0.3,
        metalness: 0.05,
        emissive: new THREE.Color(snake.primary),
        emissiveIntensity: 0.22,
      });

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), headMat);
      skull.scale.set(0.95, 0.72, 1.32);
      skull.castShadow = true;
      headGroup.add(skull);

      // Bright yellow glowing eyes + black pupils
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff04d });
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
        eye.position.set(side * 0.12, 0.08, 0.12);
        headGroup.add(eye);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), pupilMat);
        pupil.position.set(side * 0.13, 0.085, 0.165);
        headGroup.add(pupil);
      }

      // Red forked tongue
      const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff1e4d });
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.22), tongueMat);
      tongue.position.set(0, -0.02, 0.32);
      headGroup.add(tongue);

      this.scene.add(headGroup);
      this.snakeHeads.push({
        group: headGroup,
        tongue,
        baseY: headGroup.position.y,
        phase: Math.random() * Math.PI * 2,
        from: snake.from,
      });

      // Tapered tail tip at end
      const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), headMat);
      const tailPos = vecPts[vecPts.length - 1];
      const prevTail = vecPts[vecPts.length - 2];
      tailTip.position.copy(tailPos);
      const tailDir = new THREE.Vector3().subVectors(tailPos, prevTail).normalize();
      tailTip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailDir);
      this.scene.add(tailTip);
    }
  }

  buildCornerFlora() {
    const corners = [
      [-BOARD_HALF - 1.3, -BOARD_HALF - 1.1],
      [BOARD_HALF + 1.3, -BOARD_HALF - 1.1],
      [BOARD_HALF + 1.3, BOARD_HALF + 1.1],
      [-BOARD_HALF - 1.5, BOARD_HALF + 1.4],
    ];

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x16c96c,
      emissive: 0x064f2a,
      emissiveIntensity: 0.35,
      roughness: 0.48,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x3ef7ff,
      emissive: 0x10b9ff,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xfff0c9, roughness: 0.6 });

    for (const [cx, cz] of corners) {
      const cluster = new THREE.Group();
      cluster.position.set(cx, -0.35, cz);

      // 5 stylized jungle fern fronds
      for (let i = 0; i < 5; i++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.35, 5), leafMat);
        frond.scale.set(1, 1, 0.22);
        const angle = (i / 5) * Math.PI * 2;
        frond.rotation.z = -0.65;
        frond.rotation.y = angle;
        frond.position.set(Math.cos(angle) * 0.35, 0.45, Math.sin(angle) * 0.35);
        cluster.add(frond);
      }

      // Glowing bioluminescent mushroom
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 8), stemMat);
      stem.position.set(0.15, 0.22, 0.15);
      cluster.add(stem);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.set(0.15, 0.42, 0.15);
      cluster.add(cap);

      this.scene.add(cluster);
    }
  }

  buildFireflies() {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color(0x6effa8);
    const c2 = new THREE.Color(0xffe055);
    const c3 = new THREE.Color(0x47f3ff);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = Math.random() * 6 + 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const pick = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      colors[i * 3] = pick.r;
      colors[i * 3 + 1] = pick.g;
      colors[i * 3 + 2] = pick.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.fireflies = new THREE.Points(geo, mat);
    this.scene.add(this.fireflies);
  }

  buildPawns() {
    for (const meta of PLAYERS_META) {
      const group = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(meta.colorHex),
        emissive: new THREE.Color(meta.emissiveHex),
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.05,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd75e,
        emissive: 0x7a5000,
        emissiveIntensity: 0.25,
        roughness: 0.28,
        metalness: 0.35,
      });

      // Base pedestal
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.14, 18), goldMat);
      base.position.y = 0.07;
      base.castShadow = true;
      group.add(base);

      // Sculpted torso
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.52, 18), bodyMat);
      body.position.y = 0.38;
      body.castShadow = true;
      group.add(body);

      // Golden collar
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 18), goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.62;
      group.add(collar);

      // Gem head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), bodyMat);
      head.position.y = 0.78;
      head.castShadow = true;
      group.add(head);

      // Active turn glowing aura ring
      const auraGeo = new THREE.TorusGeometry(0.38, 0.04, 10, 28);
      const auraMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(meta.glowHex),
        transparent: true,
        opacity: 0.9,
      });
      const aura = new THREE.Mesh(auraGeo, auraMat);
      aura.rotation.x = Math.PI / 2;
      aura.position.y = 0.04;
      aura.visible = false;
      group.add(aura);

      const startPos = tileToWorld(0, meta.id);
      group.position.set(startPos.x, startPos.y, startPos.z);
      group.visible = false;

      this.scene.add(group);
      this.pawns.set(meta.id, { group, aura, colorHex: meta.colorHex });
    }
  }

  createDiceFaceTexture(value) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Warm ivory + golden jungle border
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 150);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f4ebd4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#d49d35';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    const pipCoords = {
      1: [[0.5, 0.5]],
      2: [[0.28, 0.28], [0.72, 0.72]],
      3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
      4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
      6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
    };

    ctx.fillStyle = value === 6 ? '#e62249' : '#182430';
    for (const [px, py] of pipCoords[value]) {
      ctx.beginPath();
      ctx.arc(px * size, py * size, value === 1 ? 30 : 22, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  build3DDice() {
    this.diceGroup = new THREE.Group();
    // BoxGeometry material order: +X(3), -X(4), +Y(1), -Y(6), +Z(2), -Z(5)
    const mats = [3, 4, 1, 6, 2, 5].map(
      (n) =>
        new THREE.MeshStandardMaterial({
          map: this.createDiceFaceTexture(n),
          roughness: 0.25,
          metalness: 0.04,
        })
    );
    this.diceMesh = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.18, 1.18), mats);
    this.diceMesh.castShadow = true;
    this.diceGroup.add(this.diceMesh);

    this.diceGroup.position.set(0, 1.35, 0);
    this.diceGroup.visible = false;
    this.scene.add(this.diceGroup);
  }

  /**
   * Giant camera-mounted 3D viper that lunges straight at the screen on snake bites!
   */
  buildJumpScareSnake() {
    const root = new THREE.Group();
    root.visible = false;

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xff2950,
      emissive: 0x6b0018,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.08,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffd84d,
      emissive: 0x805000,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const mouthInnerMat = new THREE.MeshStandardMaterial({
      color: 0x6e0820,
      emissive: 0x3b0010,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });
    const fangMat = new THREE.MeshStandardMaterial({
      color: 0xfffef7,
      emissive: 0xffffff,
      emissiveIntensity: 0.22,
      roughness: 0.12,
    });
    const venomMat = new THREE.MeshBasicMaterial({ color: 0x4dff68 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff43b });
    const slitMat = new THREE.MeshBasicMaterial({ color: 0x090909 });
    const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff1244 });

    // Coiled muscular neck curving from bottom-back toward the head
    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -2.1, -3.2),
      new THREE.Vector3(0.45, -1.25, -2.0),
      new THREE.Vector3(-0.35, -0.55, -1.1),
      new THREE.Vector3(0, -0.1, -0.35),
    ]);
    const neckGeo = new THREE.TubeGeometry(neckCurve, 28, 0.36, 14, false);
    const neck = new THREE.Mesh(neckGeo, headMat);
    root.add(neck);

    // Glowing dorsal rings along neck
    for (let i = 1; i <= 5; i++) {
      const pt = neckCurve.getPoint(i / 6);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.045, 8, 18), stripeMat);
      band.position.copy(pt);
      band.rotation.x = Math.PI / 2.2;
      root.add(band);
    }

    // Upper Jaw Group (snout + fierce brow ridges + glowing slit eyes + curved fangs)
    const upperJaw = new THREE.Group();
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 14), headMat);
    cranium.scale.set(1.18, 0.68, 1.48);
    cranium.position.set(0, 0.18, 0.2);
    upperJaw.add(cranium);

    // Flared venomous hood cheeks
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), stripeMat);
      cheek.scale.set(0.85, 0.52, 1.25);
      cheek.position.set(side * 0.48, 0.12, -0.05);
      upperJaw.add(cheek);

      // Fierce angled brow ridge
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.32), headMat);
      brow.position.set(side * 0.34, 0.42, 0.44);
      brow.rotation.z = side * -0.34;
      brow.rotation.y = side * 0.22;
      upperJaw.add(brow);

      // Glowing yellow viper eye + vertical black slit pupil
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), eyeMat);
      eye.position.set(side * 0.35, 0.3, 0.56);
      upperJaw.add(eye);

      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.22, 0.08), slitMat);
      slit.position.set(side * 0.36, 0.3, 0.68);
      upperJaw.add(slit);

      // Large curved ivory venom fang
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.48, 10), fangMat);
      fang.position.set(side * 0.26, -0.16, 0.82);
      fang.rotation.x = Math.PI + 0.16;
      upperJaw.add(fang);

      // Glowing green venom droplet at fang tip
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), venomMat);
      drop.position.set(side * 0.26, -0.4, 0.86);
      upperJaw.add(drop);
    }

    // Upper palate inside mouth
    const palate = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.08, 14), mouthInnerMat);
    palate.scale.set(1.1, 1, 1.35);
    palate.position.set(0, 0.02, 0.32);
    upperJaw.add(palate);
    root.add(upperJaw);

    // Articulated Lower Jaw Group (pivots open wide, then SNAPS shut!)
    const lowerJaw = new THREE.Group();
    lowerJaw.position.set(0, -0.05, 0.05);

    const mandible = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), headMat);
    mandible.scale.set(1.06, 0.44, 1.48);
    mandible.position.set(0, -0.12, 0.36);
    lowerJaw.add(mandible);

    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), mouthInnerMat);
    throat.scale.set(1.0, 0.42, 1.25);
    throat.position.set(0, -0.02, 0.32);
    lowerJaw.add(throat);

    // Lower smaller teeth
    for (const side of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8), fangMat);
      tooth.position.set(side * 0.2, 0.04, 0.72);
      lowerJaw.add(tooth);
    }

    // Forked crimson tongue darting out
    const tongueGroup = new THREE.Group();
    const tongueStem = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.58), tongueMat);
    tongueStem.position.set(0, 0.04, 0.82);
    tongueGroup.add(tongueStem);

    for (const side of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.024, 0.26), tongueMat);
      fork.position.set(side * 0.075, 0.04, 1.18);
      fork.rotation.y = side * 0.42;
      tongueGroup.add(fork);
    }
    lowerJaw.add(tongueGroup);
    root.add(lowerJaw);

    // Dedicated dramatic spotlight on the camera so the lunging snake pops vividly!
    const scareLight = new THREE.PointLight(0xfff0d4, 0, 8, 1.4);
    scareLight.position.set(0, 0.8, -0.4);
    this.camera.add(scareLight);

    // Attach to camera so it always lunges dead-center at the player's screen
    this.camera.add(root);

    this.scareSnake = {
      root,
      upperJaw,
      lowerJaw,
      tongueGroup,
      headMat,
      stripeMat,
      scareLight,
    };
  }

  setCameraView(preset) {
    if (!CAMERA_PRESETS[preset]) return;
    this.cameraPreset = preset;
    const { pos, target } = CAMERA_PRESETS[preset];
    gsap.to(this.camera.position, {
      x: pos[0],
      y: pos[1],
      z: pos[2],
      duration: 0.75,
      ease: 'power2.inOut',
    });
    gsap.to(this.lookTarget, {
      x: target[0],
      y: target[1],
      z: target[2],
      duration: 0.75,
      ease: 'power2.inOut',
    });
  }

  syncPawns(seats, activeSeatId = -1) {
    this.activeSeatId = activeSeatId;
    const groupsByTile = new Map();

    for (const s of seats) {
      const pawnObj = this.pawns.get(s.id);
      if (!pawnObj) continue;
      const isActive = s.kind !== 'vacant';
      pawnObj.group.visible = isActive;
      pawnObj.aura.visible = isActive && s.id === activeSeatId;
      if (!isActive) continue;

      const list = groupsByTile.get(s.position) || [];
      list.push(s.id);
      groupsByTile.set(s.position, list);
    }

    for (const [tile, ids] of groupsByTile.entries()) {
      ids.forEach((seatId, idx) => {
        const pawnObj = this.pawns.get(seatId);
        const base = tileToWorld(tile, seatId);
        const offset = tile === 0 ? { dx: 0, dz: 0 } : getStackOffset(idx, ids.length);
        pawnObj.group.position.set(base.x + offset.dx, base.y, base.z + offset.dz);
      });
    }
  }

  spawnBurst(x, y, z, colorHex, count = 16) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 2.2 + Math.random() * 2.8,
        vz: Math.sin(angle) * speed,
        life: 0.75 + Math.random() * 0.35,
        age: 0,
      });
    }
  }

  animateDiceRoll(finalValue) {
    return new Promise((resolve) => {
      if (!this.diceGroup || !this.diceMesh) {
        resolve();
        return;
      }
      this.diceGroup.visible = true;
      this.diceGroup.position.set(0, 3.6, 1.4);
      this.diceGroup.scale.set(0.3, 0.3, 0.3);

      const targetRot = DICE_FACE_ROTATIONS[finalValue] || { x: 0, z: 0 };
      const tl = gsap.timeline({
        onComplete: () => {
          this.spawnBurst(0, 1.2, 1.4, finalValue === 6 ? '#ffd84d' : '#45ff9e', 18);
          setTimeout(() => {
            gsap.to(this.diceGroup.scale, {
              x: 0.01,
              y: 0.01,
              z: 0.01,
              duration: 0.22,
              onComplete: () => {
                this.diceGroup.visible = false;
              },
            });
          }, 550);
          resolve();
        },
      });

      tl.to(this.diceGroup.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.25, ease: 'back.out(1.7)' }, 0)
        .to(this.diceGroup.position, { y: 1.45, duration: 0.55, ease: 'bounce.out' }, 0)
        .to(
          this.diceMesh.rotation,
          {
            x: targetRot.x + Math.PI * 4,
            y: Math.PI * 2,
            z: targetRot.z + Math.PI * 4,
            duration: 0.72,
            ease: 'power3.out',
          },
          0
        )
        .to(this.diceGroup.scale, { x: 1, y: 1, z: 1, duration: 0.2 }, 0.55);
    });
  }

  animatePawnSteps(seatId, fromTile, toTile) {
    const pawnObj = this.pawns.get(seatId);
    if (!pawnObj || toTile <= fromTile) return Promise.resolve();

    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      for (let step = fromTile + 1; step <= toTile; step++) {
        const dest = tileToWorld(step, seatId);
        tl.to(pawnObj.group.position, {
          x: dest.x,
          z: dest.z,
          duration: 0.21,
          ease: 'power1.inOut',
        })
          .to(
            pawnObj.group.position,
            {
              y: dest.y + 0.58,
              duration: 0.1,
              ease: 'power2.out',
              yoyo: true,
              repeat: 1,
            },
            '<'
          )
          .call(() => {
            this.spawnBurst(dest.x, dest.y + 0.12, dest.z, pawnObj.colorHex, 6);
          });
      }
    });
  }

  animateLadderClimb(seatId, ladder) {
    const pawnObj = this.pawns.get(seatId);
    if (!pawnObj || !ladder) return Promise.resolve();
    const start = tileToWorld(ladder.from, seatId);
    const end = tileToWorld(ladder.to, seatId);

    return new Promise((resolve) => {
      this.spawnBurst(start.x, start.y + 0.3, start.z, '#45ff9e', 20);
      const progress = { t: 0 };
      gsap.to(progress, {
        t: 1,
        duration: 1.05,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = progress.t;
          const x = start.x + (end.x - start.x) * t;
          const z = start.z + (end.z - start.z) * t;
          const hop = Math.abs(Math.sin(t * Math.PI * 5)) * 0.26;
          pawnObj.group.position.set(x, BOARD_TOP_Y + 0.26 + hop, z);
          if (Math.random() < 0.28) {
            this.spawnBurst(x, BOARD_TOP_Y + 0.35, z, '#ffd84d', 2);
          }
        },
        onComplete: () => {
          pawnObj.group.position.set(end.x, end.y, end.z);
          this.spawnBurst(end.x, end.y + 0.35, end.z, '#ffd84d', 24);
          resolve();
        },
      });
    });
  }

  /**
   * 3D Jump-Scare: giant snake rockets straight at the camera lens with wide-open fangs,
   * snaps shut on impact, shakes the screen, then recoils out of frame.
   */
  animateSnakeJumpScare(snake, onImpact) {
    if (!this.scareSnake) return Promise.resolve();
    const { root, upperJaw, lowerJaw, tongueGroup, headMat, stripeMat, scareLight } = this.scareSnake;

    // Match the exact colors of the snake that bit the player
    if (snake?.primary) {
      headMat.color.set(snake.primary);
      headMat.emissive.set(snake.primary);
      headMat.emissiveIntensity = 0.28;
    }
    if (snake?.stripe) {
      stripeMat.color.set(snake.stripe);
      stripeMat.emissive.set(snake.stripe);
      stripeMat.emissiveIntensity = 0.22;
    }

    root.visible = true;
    root.position.set(0, -2.5, -8.2);
    root.rotation.set(-0.35, 0, 0.14);
    root.scale.set(0.32, 0.32, 0.32);
    upperJaw.rotation.x = -0.18;
    lowerJaw.rotation.x = 0.25;
    tongueGroup.scale.z = 1;
    scareLight.intensity = 2.8;

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          root.visible = false;
          scareLight.intensity = 0;
          resolve();
        },
      });

      // 1. Sudden explosive lunge straight at the screen, mouth gaping wide!
      tl.to(
        root.position,
        { x: 0, y: -0.05, z: -1.95, duration: 0.24, ease: 'power4.in' },
        0
      )
        .to(root.scale, { x: 1.22, y: 1.22, z: 1.22, duration: 0.24, ease: 'power4.in' }, 0)
        .to(root.rotation, { x: 0.08, y: 0, z: -0.06, duration: 0.24, ease: 'power2.out' }, 0)
        .to(upperJaw.rotation, { x: -0.34, duration: 0.22, ease: 'power2.out' }, 0)
        .to(lowerJaw.rotation, { x: 0.92, duration: 0.22, ease: 'power2.out' }, 0)
        .to(tongueGroup.scale, { z: 1.55, duration: 0.14, yoyo: true, repeat: 1 }, 0.06)

        // 2. CHOMP! Jaws slam shut right in front of the lens + impact callback
        .call(() => {
          onImpact?.();
        }, null, 0.25)
        .to(upperJaw.rotation, { x: 0.04, duration: 0.09, ease: 'power4.in' }, 0.25)
        .to(lowerJaw.rotation, { x: 0.08, duration: 0.09, ease: 'power4.in' }, 0.25)
        .to(root.position, { z: -1.62, duration: 0.09, ease: 'power4.out' }, 0.25)

        // 3. Menacing predatory head shake while clamping down
        .to(root.rotation, { z: 0.2, y: 0.12, duration: 0.07, ease: 'power1.inOut' }, 0.34)
        .to(root.rotation, { z: -0.22, y: -0.14, duration: 0.08, ease: 'power1.inOut' }, 0.41)
        .to(root.rotation, { z: 0.14, y: 0.08, duration: 0.08, ease: 'power1.inOut' }, 0.49)
        .to(lowerJaw.rotation, { x: 0.48, duration: 0.14, ease: 'power2.out' }, 0.52)

        // 4. Whip back down out of frame
        .to(
          root.position,
          { x: 0.4, y: -3.4, z: -7.5, duration: 0.36, ease: 'power3.in' },
          0.66
        )
        .to(root.scale, { x: 0.35, y: 0.35, z: 0.35, duration: 0.36, ease: 'power2.in' }, 0.66)
        .to(scareLight, { intensity: 0, duration: 0.3, ease: 'power2.in' }, 0.72);
    });
  }

  animateSnakeSlide(seatId, snake) {
    const pawnObj = this.pawns.get(seatId);
    if (!pawnObj || !snake) return Promise.resolve();

    const pts = getSnakeCurvePoints(snake).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);

    // Subtle snake head lunge
    const headEntry = this.snakeHeads.find((h) => h.from === snake.from);
    if (headEntry) {
      gsap.fromTo(
        headEntry.group.scale,
        { x: 1, y: 1, z: 1 },
        { x: 1.45, y: 1.45, z: 1.45, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' }
      );
    }

    return new Promise((resolve) => {
      const startPt = pts[0];
      this.spawnBurst(startPt.x, startPt.y + 0.2, startPt.z, '#ff3860', 22);
      const progress = { t: 0 };
      gsap.to(progress, {
        t: 1,
        duration: 1.35,
        ease: 'power2.in',
        onUpdate: () => {
          const p = curve.getPoint(progress.t);
          pawnObj.group.position.set(p.x, p.y + 0.16, p.z);
          pawnObj.group.rotation.z = Math.sin(progress.t * Math.PI * 10) * 0.28;
          if (Math.random() < 0.25) {
            this.spawnBurst(p.x, p.y + 0.15, p.z, '#ff5e8a', 2);
          }
        },
        onComplete: () => {
          pawnObj.group.rotation.z = 0;
          const end = tileToWorld(snake.to, seatId);
          pawnObj.group.position.set(end.x, end.y, end.z);
          this.spawnBurst(end.x, end.y + 0.25, end.z, '#ff3860', 18);
          resolve();
        },
      });
    });
  }

  animateWinCelebration(seatId) {
    const p100 = tileToWorld(100);
    const colors = ['#ffd84d', '#18f084', '#ff3860', '#20c4ff'];
    colors.forEach((c, idx) => {
      setTimeout(() => {
        this.spawnBurst(
          p100.x + (Math.random() - 0.5) * 2.2,
          p100.y + 1.4 + Math.random(),
          p100.z + (Math.random() - 0.5) * 2.2,
          c,
          28
        );
      }, idx * 240);
    });

    const pawnObj = this.pawns.get(seatId);
    if (pawnObj) {
      gsap.to(pawnObj.group.rotation, { y: pawnObj.group.rotation.y + Math.PI * 4, duration: 1.2, ease: 'power2.out' });
    }
  }

  handleResize() {
    if (!this.canvas || !this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // Slightly pull camera back on portrait phones so full 10x10 board fits cleanly
    this.camera.fov = w < 680 ? 54 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  animate() {
    if (this.disposed) return;
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // Gentle snake breathing & tongue flicker
    for (const s of this.snakeHeads) {
      s.group.position.y = s.baseY + Math.sin(elapsed * 2.4 + s.phase) * 0.03;
      s.tongue.scale.z = 0.65 + Math.max(0, Math.sin(elapsed * 7.5 + s.phase)) * 0.7;
    }

    // Tile 100 crown halo pulse
    if (this.crownHalo) {
      const sc = 1 + Math.sin(elapsed * 3.2) * 0.1;
      this.crownHalo.scale.set(sc, sc, 1);
    }

    // Active pawn aura pulse
    if (this.activeSeatId >= 0) {
      const p = this.pawns.get(this.activeSeatId);
      if (p && p.aura.visible) {
        const sc = 1 + Math.sin(elapsed * 4.5) * 0.14;
        p.aura.scale.set(sc, sc, 1);
      }
    }

    // Drifting jungle fireflies
    if (this.fireflies) {
      const pos = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.25;
        if (y > 6.5) y = 0.4;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.fireflies.rotation.y = elapsed * 0.04;
    }

    // Burst particles physics
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.age += dt;
      if (pt.age >= pt.life) {
        this.scene.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        pt.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= 7.5 * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.mesh.material.opacity = 1 - pt.age / pt.life;
    }

    this.camera.lookAt(this.lookTarget);
    this.renderer.render(this.scene, this.camera);
  }
}
