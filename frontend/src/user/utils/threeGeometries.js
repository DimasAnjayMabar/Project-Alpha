import * as THREE from 'three';

export function createCottonWeaveBumpTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const weave = ((x + y) / 2) % 2 === 0;
      const threadNoise = ((x * 17 + y * 31) % 18) - 9;
      const val = Math.max(90, Math.min(175, (weave ? 148 : 112) + threadNoise));
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const bumpTex = new THREE.CanvasTexture(canvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(34, 34);
  return bumpTex;
}

export function createStudioEnvMap(renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#2B221B');

  const topBox = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: '#FFF6E5', side: THREE.DoubleSide })
  );
  topBox.position.set(0, 8, 0);
  topBox.rotation.x = Math.PI / 2;
  envScene.add(topBox);

  const leftBox = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 8),
    new THREE.MeshBasicMaterial({ color: '#FFE4BA', side: THREE.DoubleSide })
  );
  leftBox.position.set(-8, 2, 4);
  leftBox.lookAt(0, 0, 0);
  envScene.add(leftBox);

  const rightBox = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 8),
    new THREE.MeshBasicMaterial({ color: '#DCE9F7', side: THREE.DoubleSide })
  );
  rightBox.position.set(8, 1, 3);
  rightBox.lookAt(0, 0, 0);
  envScene.add(rightBox);

  const renderTarget = pmremGenerator.fromScene(envScene, 0.04);
  topBox.geometry.dispose();
  topBox.material.dispose();
  leftBox.geometry.dispose();
  leftBox.material.dispose();
  rightBox.geometry.dispose();
  rightBox.material.dispose();
  pmremGenerator.dispose();

  return renderTarget.texture;
}

export function createTailoredTorsoGeometry() {
  const radialSegs = 72;
  const heightSegs = 60;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const yMin = -0.92;
  const yMax = 0.96;

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const baseY = yMin + v * (yMax - yMin);

    let rx = 0.64;
    let rz = 0.37;

    if (v < 0.38) {
      const k = v / 0.38;
      const waistPinch = Math.sin(k * Math.PI) * 0.045;
      rx = 0.64 - waistPinch;
      rz = 0.37 - waistPinch * 0.75;
    } else if (v < 0.76) {
      const k = (v - 0.38) / 0.38;
      const smooth = k * k * (3 - 2 * k);
      rx = 0.64 + smooth * 0.055;
      rz = 0.37 + smooth * 0.045;
    } else {
      const k = (v - 0.76) / 0.24;
      const shoulderEase = Math.pow(k, 1.55);
      rx = 0.695 * (1 - shoulderEase) + 0.255 * shoulderEase;
      rz = 0.415 * (1 - shoulderEase) + 0.225 * shoulderEase;
    }

    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const chestFullness = cosT > 0 ? 1 + 0.06 * Math.sin(v * Math.PI) * Math.pow(cosT, 1.5) : 1;
      const backCurve = cosT < 0 ? 0.94 : 1.0;

      const drapeFold =
        Math.sin(theta * 7 + v * 5) * 0.008 * Math.sin(v * Math.PI) +
        Math.cos(theta * 11 - v * 3) * 0.004 * (1 - v);

      const x = sinT * (rx + drapeFold);
      const z = cosT * rz * chestFullness * backCurve + drapeFold * 0.6;

      let y = baseY;
      if (v < 0.2) {
        const hemWeight = 1 - v / 0.2;
        const hemCurve = Math.cos(2 * theta) * 0.055;
        y -= hemCurve * hemWeight;
      }
      if (v > 0.85 && cosT > 0) {
        const neckWeight = (v - 0.85) / 0.15;
        y -= Math.pow(cosT, 2) * 0.075 * neckWeight;
      }

      positions.push(x, y, z);
      uvs.push(u * 2.0, v * 1.65);

      const underarmAo =
        v > 0.58 && v < 0.82 ? Math.abs(sinT) * 0.08 * Math.sin(((v - 0.58) / 0.24) * Math.PI) : 0;
      const shade = Math.max(0.86, 1.0 - underarmAo + drapeFold * 2.5);
      colors.push(shade, shade, shade);
    }
  }

  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radialSegs; ix++) {
      const a = iy * (radialSegs + 1) + ix;
      const b = a + 1;
      const c = a + (radialSegs + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createTailoredSleeveGeometry(side = 1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.52, 0.72, -0.02),
    new THREE.Vector3(side * 0.74, 0.55, 0.01),
    new THREE.Vector3(side * 0.88, 0.12, 0.05),
    new THREE.Vector3(side * 0.96, -0.34, 0.14),
    new THREE.Vector3(side * 0.99, -0.47, 0.17),
  ]);

  const lenSegs = 44;
  const radSegs = 32;
  const frames = curve.computeFrenetFrames(lenSegs, false);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= lenSegs; i++) {
    const u = i / lenSegs;
    const pt = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    let rMajor = 0.215 * (1 - u) + 0.122 * u;
    let rMinor = 0.175 * (1 - u) + 0.118 * u;

    if (u < 0.22) {
      const cap = 1 - u / 0.22;
      rMajor += cap * 0.045;
    }
    if (u > 0.78 && u < 0.9) {
      rMajor += Math.sin(((u - 0.78) / 0.12) * Math.PI) * 0.012;
      rMinor += Math.sin(((u - 0.78) / 0.12) * Math.PI) * 0.012;
    }

    for (let j = 0; j <= radSegs; j++) {
      const v = j / radSegs;
      const angle = v * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const crease =
        u > 0.35 && u < 0.65
          ? Math.sin(angle * 4 + u * 10) * 0.005 * Math.sin(((u - 0.35) / 0.3) * Math.PI)
          : 0;

      const localX = cosA * (rMajor + crease);
      const localY = sinA * (rMinor + crease);

      const vx = pt.x + N.x * localX + B.x * localY;
      const vy = pt.y + N.y * localX + B.y * localY;
      const vz = pt.z + N.z * localX + B.z * localY;

      positions.push(vx, vy, vz);
      uvs.push(v * 1.1, u * 1.5);
      const shade = 0.94 + crease * 4;
      colors.push(shade, shade, shade);
    }
  }

  for (let i = 0; i < lenSegs; i++) {
    for (let j = 0; j < radSegs; j++) {
      const a = i * (radSegs + 1) + j;
      const b = a + 1;
      const c = a + (radSegs + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createFoldedCollarGeometry() {
  const segs = 56;
  const rows = 10;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const startAngle = 0.22;
      const endAngle = Math.PI * 2 - 0.22;
      const theta = startAngle + u * (endAngle - startAngle);

      const frontProximity = Math.pow(Math.max(0, Math.cos(theta)), 1.6);
      const collarDrop = 0.13 + frontProximity * 0.085;

      const baseR = 0.255 + t * (0.058 + frontProximity * 0.025);
      const x = Math.sin(theta) * baseR;
      const z = Math.cos(theta) * (baseR * 0.92) + 0.025;
      const y = 1.05 - t * collarDrop - frontProximity * 0.035;

      positions.push(x, y, z);
      uvs.push(u * 2.2, t * 0.45);
      const ao = 0.88 + t * 0.12;
      colors.push(ao, ao, ao);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + 1;
      const c = a + (segs + 1);
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createPleatedClothGeometry() {
  const segX = 96;
  const segY = 72;
  const geo = new THREE.PlaneGeometry(2.32, 2.75, segX, segY);
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    baseX[i] = x;
    baseY[i] = y;

    const pleat = Math.sin(x * 11.5) * 0.055 + Math.cos(x * 5.2) * 0.03;
    const shade = 0.91 + pleat * 1.15;
    colors[i * 3] = Math.min(1, Math.max(0.82, shade));
    colors[i * 3 + 1] = Math.min(1, Math.max(0.82, shade));
    colors[i * 3 + 2] = Math.min(1, Math.max(0.82, shade));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.userData = { baseX, baseY };
  return geo;
}

export function createSculptedToteGeometry() {
  const radSegs = 64;
  const heightSegs = 36;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const y = -0.74 + v * 1.48;

    const halfW = 0.62 + v * 0.13;
    const halfD = 0.21 + Math.sin(v * Math.PI) * 0.035;

    for (let ix = 0; ix <= radSegs; ix++) {
      const u = ix / radSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const exp = 0.44;
      const sx = Math.sign(sinT) * Math.pow(Math.abs(sinT), exp);
      const sz = Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);

      const isSide = Math.pow(Math.abs(sinT), 3);
      const gussetPinch = isSide * Math.sin(v * Math.PI) * 0.055;

      const x = sx * (halfW - gussetPinch);
      const z = sz * halfD;

      positions.push(x, y, z);
      uvs.push(u * 2.0, v * 1.15);

      const shade = 0.94 - gussetPinch * 0.8;
      colors.push(shade, shade, shade);
    }
  }

  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radSegs; ix++) {
      const a = iy * (radSegs + 1) + ix;
      const b = a + 1;
      const c = a + (radSegs + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function disposeGroupChildren(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
    });
  }
}