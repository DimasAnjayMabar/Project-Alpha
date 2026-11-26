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

function buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, flipWinding = false) {
  const indices = [];
  for (let r = 0; r < segsV; r++) {
    for (let c = 0; c < segsU; c++) {
      const a = r * (segsU + 1) + c;
      const b = a + 1;
      const cIdx = a + (segsU + 1);
      const d = cIdx + 1;
      if (flipWinding) {
        indices.push(a, d, b, a, cIdx, d);
      } else {
        indices.push(a, b, d, a, d, cIdx);
      }
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

function sampleSurfaceNormal(samplerFn, theta, v) {
  const epsT = 0.004;
  const epsV = 0.004;
  const pT1 = samplerFn(theta + epsT, v);
  const pT0 = samplerFn(theta - epsT, v);
  const pV1 = samplerFn(theta, Math.min(1, v + epsV));
  const pV0 = samplerFn(theta, Math.max(0, v - epsV));

  const dT = new THREE.Vector3(pT1.x - pT0.x, pT1.y - pT0.y, pT1.z - pT0.z);
  const dV = new THREE.Vector3(pV1.x - pV0.x, pV1.y - pV0.y, pV1.z - pV0.z);
  return new THREE.Vector3().crossVectors(dT, dV).normalize();
}

/* ============================================================================
 * 1. KEMEJA BATIK TAILORED (REALISTIC DRESS SHIRT)
 * ============================================================================ */

function sampleShirtTorsoPoint(theta, v) {
  const yMin = -0.94;
  const yMax = 0.96;
  const baseY = yMin + v * (yMax - yMin);

  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Bentuk penampang dada/punggung yang lebih tegas daripada tabung oval
  const sx = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.94);
  const sz = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.85);

  let rx = 0.60;
  let rz = 0.345;

  if (v < 0.32) {
    // Pinggang ramping menuju pinggul bawah kemeja
    const k = v / 0.32;
    const taper = Math.sin(k * Math.PI * 0.9);
    rx = 0.60 - taper * 0.044;
    rz = 0.345 - taper * 0.028;
  } else if (v < 0.87) {
    // Lebar dada menuju bahu atas terstruktur agar lubang lengan sejajar
    const k = (v - 0.32) / 0.55;
    const smooth = k * k * (3 - 2 * k);
    rx = 0.56 + smooth * 0.115;
    const chestPeak = Math.sin(k * Math.PI * 0.78);
    rz = 0.318 + smooth * 0.027 + chestPeak * 0.044;
  } else {
    // Kemiringan bahu atas menuju kerah leher (garis bahu realistis ~23 derajat)
    const k = (v - 0.87) / 0.13;
    const slopeEase = Math.pow(k, 1.08);
    rx = 0.675 * (1 - slopeEase) + 0.236 * slopeEase;
    rz = 0.345 * (1 - slopeEase) + 0.214 * slopeEase;
  }

  // Kontur dada depan, lengkung punggung lumbar, dan lipit punggung tengah
  const chestLift =
    cosT > 0 && v > 0.44 && v < 0.88
      ? 0.036 * Math.sin(((v - 0.44) / 0.44) * Math.PI) * Math.pow(cosT, 1.35)
      : 0;
  const lumbarTuck =
    cosT < 0 && v > 0.16 && v < 0.54
      ? -0.022 * Math.sin(((v - 0.16) / 0.38) * Math.PI) * Math.pow(-cosT, 1.5)
      : 0;
  const backBoxPleat =
    cosT < -0.75 && v > 0.16 && v < 0.84
      ? Math.cos((theta - Math.PI) * 9) * 0.008 * Math.sin(((v - 0.16) / 0.68) * Math.PI)
      : 0;

  const drapeFold =
    Math.sin(theta * 8 + v * 4) * 0.0048 * Math.sin(v * Math.PI) +
    Math.cos(theta * 12 - v * 3) * 0.0028 * (1 - v);

  const x = sx * (rx + drapeFold);
  const z = sz * rz + chestLift + lumbarTuck + backBoxPleat + drapeFold * 0.45;

  let y = baseY;

  // Lekuk garis bahu atas agar tulang bahu terlihat tegas lalu naik ke leher
  if (v > 0.82) {
    const k = (v - 0.82) / 0.18;
    y += Math.sin(k * Math.PI) * 0.038 * Math.pow(Math.abs(sinT), 1.4);
  }

  // Ujung bawah kemeja melengkung (shirt-tail hem: depan & belakang turun, sisi naik)
  if (v < 0.24) {
    const hemWeight = 1 - v / 0.24;
    const scallopedHem = Math.cos(2 * theta) * 0.068 - 0.012;
    y -= scallopedHem * hemWeight;
  }

  // Kerah leher depan turun lebih rendah daripada kerah belakang
  if (v > 0.90 && cosT > 0) {
    const neckWeight = (v - 0.90) / 0.10;
    y -= Math.pow(cosT, 1.75) * 0.095 * neckWeight;
  }

  return { x, y, z, sinT, cosT, drapeFold };
}

export function createTailoredTorsoGeometry() {
  const radialSegs = 80;
  const heightSegs = 68;
  const positions = [];
  const uvs = [];
  const colors = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const pt = sampleShirtTorsoPoint(theta, v);

      positions.push(pt.x, pt.y, pt.z);
      uvs.push(u * 2.0, v * 1.65);

      const underarmAo =
        v > 0.64 && v < 0.86
          ? Math.pow(Math.abs(pt.sinT), 1.8) * 0.085 * Math.sin(((v - 0.64) / 0.22) * Math.PI)
          : 0;
      const collarLineAo = v > 0.95 ? ((v - 0.95) / 0.05) * 0.06 : 0;
      const yokeLineAo =
        pt.cosT < -0.15 && Math.abs(v - 0.848) < 0.02 ? 0.055 * (1 - Math.abs(v - 0.848) / 0.02) : 0;
      const shade = Math.max(0.84, Math.min(1.0, 0.985 - underarmAo - collarLineAo - yokeLineAo + pt.drapeFold * 3));
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, radialSegs, heightSegs, false);
}

export function createCollarStandGeometry() {
  const segs = 64;
  const rows = 8;
  const positions = [];
  const uvs = [];
  const colors = [];

  const startAngle = 0.065;
  const endAngle = Math.PI * 2 - 0.065;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const theta = startAngle + u * (endAngle - startAngle);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const frontScoop = Math.pow(Math.max(0, cosT), 1.75);
      const yBottom = 0.955 - frontScoop * 0.095;
      const standHeight = 0.095 - frontScoop * 0.018;
      const y = yBottom + t * standHeight;

      const rX = 0.242 - t * 0.014;
      const rZ = 0.222 - t * 0.012;
      const x = Math.sin(theta) * rX;
      const z = Math.cos(theta) * rZ;

      positions.push(x, y, z);
      uvs.push(u * 2.0, t * 0.25);

      const shade = 0.87 + t * 0.11 - (sinT > 0 && cosT > 0.92 ? 0.03 : 0);
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segs, rows, false);
}

export function createFoldedCollarGeometry() {
  const segs = 68;
  const rows = 14;
  const positions = [];
  const uvs = [];
  const colors = [];

  const startAngle = 0.135;
  const endAngle = Math.PI * 2 - 0.135;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const theta = startAngle + u * (endAngle - startAngle);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const frontProx = Math.pow(Math.max(0, cosT), 1.55);
      const tipPoint = Math.pow(Math.max(0, cosT), 3.6);
      const standTopY = 1.05 - Math.pow(Math.max(0, cosT), 1.75) * 0.113;

      let outSpread;
      let y;
      if (t < 0.22) {
        // Lipatan atas kerah yang membulat rapi di atas collar stand
        const k = t / 0.22;
        outSpread = 0.008 + Math.sin(k * Math.PI * 0.5) * 0.028;
        y = standTopY + Math.sin(k * Math.PI) * 0.016 - k * 0.006;
      } else {
        // Daun kerah yang meluncur ke luar & meruncing di bagian depan
        const k = (t - 0.22) / 0.78;
        outSpread = 0.036 + k * (0.058 + frontProx * 0.028);
        const leafDrop = 0.108 + frontProx * 0.095 + tipPoint * 0.048;
        y = standTopY + 0.008 - k * leafDrop;
      }

      const rX = 0.230 + outSpread;
      const rZ = 0.212 + outSpread * 0.94;
      const x = sinT * rX;
      const z = cosT * rZ + t * frontProx * 0.020;

      positions.push(x, y, z);
      uvs.push(u * 2.2, t * 0.45);

      const creaseAo = t < 0.24 ? 0.85 + (t / 0.24) * 0.13 : 0.98 - (t - 0.24) * 0.07;
      colors.push(creaseAo, creaseAo, creaseAo);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segs, rows, true);
}

export function createShirtPlacketGeometry() {
  const segsU = 6;
  const segsV = 54;
  const positions = [];
  const uvs = [];
  const colors = [];

  const halfAngle = 0.068;

  for (let r = 0; r <= segsV; r++) {
    const v = 0.015 + (r / segsV) * 0.975;
    for (let c = 0; c <= segsU; c++) {
      const frac = c / segsU;
      const theta = (frac * 2 - 1) * halfAngle;
      const pt = sampleShirtTorsoPoint(theta, v);
      const nrm = sampleSurfaceNormal(sampleShirtTorsoPoint, theta, v);

      // Profil plaket datar yang rata dengan tepi jahitan kiri-kanan
      const edgeDist = Math.abs(frac * 2 - 1);
      const lift = edgeDist > 0.78 ? (1 - edgeDist) / 0.22 * 0.011 : 0.011;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push(0.97 + frac * 0.06, v * 1.65);

      const stitchShade = edgeDist > 0.78 ? 0.86 : 0.98;
      colors.push(stitchShade, stitchShade, stitchShade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, false);
}

export function getShirtButtonPoses() {
  const poses = [];
  // 1 kancing leher paling atas pada collar stand
  poses.push({
    position: new THREE.Vector3(0, 0.902, 0.224),
    normal: new THREE.Vector3(0, 0.14, 0.99).normalize(),
  });

  // 6 kancing plaket badan depan sejajar dari dada ke bawah
  const vSteps = [0.85, 0.715, 0.58, 0.445, 0.31, 0.175];
  vSteps.forEach((v) => {
    const pt = sampleShirtTorsoPoint(0, v);
    const nrm = sampleSurfaceNormal(sampleShirtTorsoPoint, 0, v);
    poses.push({
      position: new THREE.Vector3(
        pt.x + nrm.x * 0.0135,
        pt.y + nrm.y * 0.0135,
        pt.z + nrm.z * 0.0135
      ),
      normal: nrm,
    });
  });

  return poses;
}

export function createShirtPocketGeometry() {
  const segsU = 16;
  const segsV = 14;
  const positions = [];
  const uvs = [];
  const colors = [];

  const thetaCenter = 0.40;
  const halfTheta = 0.175;
  const vTop = 0.745;
  const vSideBottom = 0.615;
  const vCenterBottom = 0.575;

  // Grid permukaan depan saku mengikuti lengkung dada + 1 baris lipatan tepi ke permukaan torso
  // Gunakan s in [0..1] horizontal, r in [0..segsV+1] di mana r=0 dan tepi luar menempel (offset=0)
  for (let r = 0; r <= segsV; r++) {
    const vf = r / segsV; // 0 = bawah, 1 = atas
    for (let c = 0; c <= segsU; c++) {
      const uf = c / segsU; // 0 = sisi kiri, 1 = sisi kanan
      const distCenter = Math.abs(uf * 2 - 1); // 0 di tengah, 1 di tepi kiri/kanan

      const theta = thetaCenter + (uf * 2 - 1) * halfTheta;
      const vBottomAtU = vCenterBottom + distCenter * (vSideBottom - vCenterBottom);
      const v = vBottomAtU + vf * (vTop - vBottomAtU);

      const pt = sampleShirtTorsoPoint(theta, v);
      const nrm = sampleSurfaceNormal(sampleShirtTorsoPoint, theta, v);

      const isBorder = r === 0 || c === 0 || c === segsU;
      const hemExtra = vf > 0.85 ? 0.0035 : 0;
      const lift = isBorder ? 0.001 : 0.011 + hemExtra;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push((theta / (Math.PI * 2)) * 2.0, v * 1.65);

      const stitchShade = isBorder || (vf > 0.82 && vf < 0.88) ? 0.84 : 0.985;
      colors.push(stitchShade, stitchShade, stitchShade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, false);
}

export function createBackYokeSeamGeometry() {
  const segsU = 36;
  const segsV = 4;
  const positions = [];
  const uvs = [];
  const colors = [];

  const thetaStart = Math.PI * 0.56;
  const thetaEnd = Math.PI * 1.44;
  const vStart = 0.84;
  const vEnd = 0.856;

  for (let r = 0; r <= segsV; r++) {
    const rf = r / segsV;
    const v = vStart + rf * (vEnd - vStart);
    for (let c = 0; c <= segsU; c++) {
      const cf = c / segsU;
      const theta = thetaStart + cf * (thetaEnd - thetaStart);
      const pt = sampleShirtTorsoPoint(theta, v);
      const nrm = sampleSurfaceNormal(sampleShirtTorsoPoint, theta, v);

      const arch = Math.sin(rf * Math.PI);
      const lift = arch * 0.006;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push((theta / (Math.PI * 2)) * 2.0, v * 1.65);
      const shade = 0.85 + arch * 0.1;
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, false);
}

function buildClosedRootSleeveGeometry(
  curve,
  side,
  {
    rPrimaryStart,
    rPrimaryEnd,
    rFrontStart,
    rFrontEnd,
    lenSegs = 46,
    radSegs = 34,
    uvScaleU = 1.0,
    uvScaleV = 1.5,
    wristPleat = false,
    cuffHemShade = false,
  }
) {
  const zRef = new THREE.Vector3(0, 0, 1);
  const positions = [];
  const uvs = [];
  const colors = [];

  for (let i = 0; i <= lenSegs; i++) {
    const u = i / lenSegs;
    const pt = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();

    // Frame bebas puntiran: framePrimary mengarah +Y di pangkal bahu lalu melengkung ke luar lengan,
    // frameFront selalu konsisten menghadap +Z (bagian depan lengan).
    const framePrimary = new THREE.Vector3()
      .crossVectors(zRef, tangent)
      .multiplyScalar(side);
    if (framePrimary.lengthSq() < 1e-6) {
      framePrimary.set(0, 1, 0);
    } else {
      framePrimary.normalize();
    }
    const frameFront = new THREE.Vector3()
      .crossVectors(tangent, framePrimary)
      .multiplyScalar(side)
      .normalize();

    // Tutup pangkal dalam lengan (u = 0) di dalam rongga badan agar tidak pernah terlihat berlubang
    const rootTaper = u < 0.14 ? Math.sin((u / 0.14) * (Math.PI / 2)) : 1.0;

    let rPrimary = (rPrimaryStart * (1 - u) + rPrimaryEnd * u) * rootTaper;
    let rFront = (rFrontStart * (1 - u) + rFrontEnd * u) * rootTaper;

    if (wristPleat && u > 0.84) {
      const pleatBell = Math.sin(((u - 0.84) / 0.16) * Math.PI);
      rPrimary += pleatBell * 0.011;
      rFront += pleatBell * 0.011;
    }
    if (cuffHemShade && u > 0.94) {
      rPrimary += 0.003;
      rFront += 0.003;
    }

    for (let j = 0; j <= radSegs; j++) {
      const v = j / radSegs;
      const angle = v * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const crease =
        wristPleat && u > 0.36 && u < 0.72
          ? Math.sin(angle * 4 + u * 9) * 0.004 * Math.sin(((u - 0.36) / 0.36) * Math.PI)
          : 0;

      const localPrimary = cosA * (rPrimary + crease);
      const localFront = sinA * (rFront + crease);

      const vx = pt.x + framePrimary.x * localPrimary + frameFront.x * localFront;
      const vy = pt.y + framePrimary.y * localPrimary + frameFront.y * localFront;
      const vz = pt.z + framePrimary.z * localPrimary + frameFront.z * localFront;

      positions.push(vx, vy, vz);
      uvs.push(v * uvScaleU, u * uvScaleV);

      const armholeAo = u > 0.10 && u < 0.24 ? Math.sin(((u - 0.10) / 0.14) * Math.PI) * 0.06 : 0;
      const cuffAo =
        (wristPleat && u > 0.95) || (cuffHemShade && u > 0.94) ? 0.06 : 0;
      const shade = Math.max(0.84, Math.min(1.0, 0.96 - armholeAo - cuffAo + crease * 4));
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, radSegs, lenSegs, side < 0);
}

function getShirtSleeveCurve(side = 1) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.42, 0.53, -0.02),
    new THREE.Vector3(side * 0.66, 0.535, -0.01),
    new THREE.Vector3(side * 0.77, 0.22, 0.02),
    new THREE.Vector3(side * 0.82, -0.18, 0.09),
    new THREE.Vector3(side * 0.85, -0.50, 0.16),
  ]);
}

export function createTailoredSleeveGeometry(side = 1) {
  const curve = getShirtSleeveCurve(side);
  return buildClosedRootSleeveGeometry(curve, side, {
    rPrimaryStart: 0.188,
    rPrimaryEnd: 0.122,
    rFrontStart: 0.155,
    rFrontEnd: 0.118,
    lenSegs: 46,
    radSegs: 34,
    uvScaleU: 1.1,
    uvScaleV: 1.5,
    wristPleat: true,
    cuffHemShade: false,
  });
}

export function createShirtCuffGeometry(side = 1) {
  const curve = getShirtSleeveCurve(side);
  const wristPt = curve.getPointAt(1.0);
  const tangent = curve.getTangentAt(1.0).normalize();

  const upHelper = Math.abs(tangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const orthoA = new THREE.Vector3().crossVectors(tangent, upHelper).normalize();
  const orthoB = new THREE.Vector3().crossVectors(tangent, orthoA).normalize();

  const segsLen = 8;
  const segsRad = 34;
  const cuffLength = 0.135;
  const baseRadius = 0.121;

  const positions = [];
  const uvs = [];
  const colors = [];

  for (let i = 0; i <= segsLen; i++) {
    const u = i / segsLen;
    const along = -0.018 + u * cuffLength;
    const center = wristPt.clone().addScaledVector(tangent, along);
    const radius = baseRadius * (1.015 - u * 0.03);

    for (let j = 0; j <= segsRad; j++) {
      const v = j / segsRad;
      const angle = v * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const radial = orthoA
        .clone()
        .multiplyScalar(cosA * radius)
        .addScaledVector(orthoB, sinA * radius * 0.95);
      const pt = center.clone().add(radial);

      positions.push(pt.x, pt.y, pt.z);
      uvs.push(v * 1.0, u * 0.3);

      const seamAo = u < 0.18 ? 0.85 : 0.97 - u * 0.04;
      colors.push(seamAo, seamAo, seamAo);
    }
  }

  const geometry = buildIndexedGridGeometry(positions, uvs, colors, segsRad, segsLen, false);

  // Kancing manset di sisi luar lengan
  const midCenter = wristPt.clone().addScaledVector(tangent, cuffLength * 0.44);
  const outerDir = new THREE.Vector3(side, 0, 0.28).normalize();
  // Proyeksikan outerDir tegak lurus terhadap sumbu lengan agar menempel rapi di manset
  outerDir.addScaledVector(tangent, -outerDir.dot(tangent)).normalize();

  const buttonPosition = midCenter.clone().addScaledVector(outerDir, baseRadius * 1.02);
  return {
    geometry,
    buttonPosition,
    buttonNormal: outerDir,
  };
}

/* ============================================================================
 * 2. KEBAYA KUTUBARU BATIK (SILUET FEMININ + LAPEL + BEF KUTUBARU + OBI)
 * ============================================================================ */

function sampleKebayaTorsoPoint(theta, v) {
  const yMin = -0.92;
  const yMax = 0.90;
  const baseY = yMin + v * (yMax - yMin);

  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  let rx = 0.56;
  let rz = 0.33;

  if (v < 0.38) {
    // Pinggul mekar anggun ke pinggang ramping (hourglass)
    const k = v / 0.38; // 0 = hem bawah, 1 = pinggang
    const s = k * k * (3 - 2 * k);
    rx = 0.585 * (1 - s) + 0.385 * s;
    rz = 0.345 * (1 - s) + 0.242 * s;
  } else if (v < 0.87) {
    // Pinggang ramping ke lingkar dada & bahu feminin agar lengan duduk rapi di bawah garis bahu
    const k = (v - 0.38) / 0.49;
    const s = k * k * (3 - 2 * k);
    rx = 0.385 * (1 - s) + 0.535 * s;
    rz = 0.242 * (1 - s) + 0.278 * s;
  } else {
    // Kemiringan bahu sempit feminin menuju leher
    const k = (v - 0.87) / 0.13;
    const slopeEase = Math.pow(k, 1.08);
    rx = 0.535 * (1 - slopeEase) + 0.195 * slopeEase;
    rz = 0.278 * (1 - slopeEase) + 0.178 * slopeEase;
  }

  // Kontur dada feminin (dua puncak halus kiri-kanan di depan)
  const bustBand =
    v > 0.50 && v < 0.84 ? Math.sin(((v - 0.50) / 0.34) * Math.PI) : 0;
  const thetaAbs = Math.min(Math.abs(theta), Math.abs(theta - Math.PI * 2));
  const dualBustPeak =
    cosT > 0 ? Math.exp(-Math.pow((thetaAbs - 0.40) / 0.34, 2)) : 0;
  const bustLift = bustBand * (0.068 * dualBustPeak + 0.024 * Math.pow(Math.max(0, cosT), 1.6));

  // Cekung punggung feminin
  const backHollow =
    cosT < 0 && v > 0.26 && v < 0.64
      ? -0.026 * Math.sin(((v - 0.26) / 0.38) * Math.PI) * Math.pow(-cosT, 1.5)
      : 0;

  const drapeFold = Math.sin(theta * 9 + v * 5) * 0.0038 * (1 - Math.abs(v - 0.45));

  const x = sinT * (rx + drapeFold);
  const z = cosT * rz + bustLift + backHollow + drapeFold * 0.4;

  let y = baseY;

  // Garis bahu sedikit miring halus
  if (v > 0.82) {
    const k = (v - 0.82) / 0.18;
    y += Math.sin(k * Math.PI) * 0.030 * Math.pow(Math.abs(sinT), 1.4);
  }

  // Kelim bawah kebaya: depan melengkung lancip kanan-kiri dengan belahan kecil tengah depan
  if (v < 0.24) {
    const hemWeight = 1 - v / 0.24;
    const frontApronDip = cosT > 0 ? Math.exp(-Math.pow((thetaAbs - 0.30) / 0.42, 2)) * 0.115 : 0;
    const centerSlit = cosT > 0.9 ? Math.exp(-Math.pow(thetaAbs / 0.12, 2)) * 0.055 : 0;
    const sideLift = Math.pow(Math.abs(sinT), 2.2) * 0.045;
    y -= (frontApronDip - centerSlit - sideLift) * hemWeight;
  }

  // Bukaan leher V terbuka khas Kebaya Kutubaru
  if (v > 0.78 && cosT > 0) {
    const neckWeight = Math.pow((v - 0.78) / 0.22, 1.15);
    y -= Math.pow(cosT, 1.95) * 0.22 * neckWeight;
  }

  return { x, y, z, sinT, cosT, thetaAbs, drapeFold };
}

export function createKebayaTorsoGeometry() {
  const radialSegs = 80;
  const heightSegs = 68;
  const positions = [];
  const uvs = [];
  const colors = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const pt = sampleKebayaTorsoPoint(theta, v);

      positions.push(pt.x, pt.y, pt.z);
      uvs.push(u * 2.0, v * 1.65);

      const waistDartAo =
        v > 0.20 && v < 0.56
          ? Math.exp(-Math.pow((pt.thetaAbs - 0.44) / 0.12, 2)) * 0.05 * Math.sin(((v - 0.20) / 0.36) * Math.PI)
          : 0;
      const underarmAo =
        v > 0.64 && v < 0.86
          ? Math.pow(Math.abs(pt.sinT), 1.8) * 0.075 * Math.sin(((v - 0.64) / 0.22) * Math.PI)
          : 0;
      const shade = Math.max(0.84, Math.min(1.0, 0.985 - waistDartAo - underarmAo + pt.drapeFold * 3));
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, radialSegs, heightSegs, false);
}

export function createKebayaLapelGeometry(side = 1) {
  // Lipatan kerah/kelepak Kartini-Kutubaru dari tengkuk belakang memeluk bukaan dada turun ke kelim depan
  const lenSegs = 54;
  const widthSegs = 8;
  const positions = [];
  const uvs = [];
  const colors = [];

  for (let r = 0; r <= lenSegs; r++) {
    const s = r / lenSegs; // 0 = tengkuk belakang (theta=pi), 0.32 = dada atas, 1 = kelim bawah
    let centerTheta;
    let centerV;
    let halfWidth;

    if (s < 0.32) {
      const k = s / 0.32;
      const ease = k * k * (3 - 2 * k);
      centerTheta = side * (Math.PI * (1 - ease) + 0.26 * ease);
      centerV = 0.99 - ease * 0.235;
      halfWidth = 0.08 + ease * 0.075;
    } else if (s < 0.66) {
      const k = (s - 0.32) / 0.34;
      const ease = k * k * (3 - 2 * k);
      centerTheta = side * (0.26 * (1 - ease) + 0.13 * ease);
      centerV = 0.755 - k * 0.37;
      halfWidth = 0.155 - k * 0.03;
    } else {
      const k = (s - 0.66) / 0.34;
      centerTheta = side * (0.13 - k * 0.02);
      centerV = 0.385 - k * 0.365;
      halfWidth = 0.125 - k * 0.015;
    }

    for (let c = 0; c <= widthSegs; c++) {
      const wf = c / widthSegs; // 0 = tepi dalam dekat tengah dada, 1 = tepi luar lipatan
      const signedWf = wf * 2 - 1;
      const theta = centerTheta + side * signedWf * halfWidth * 0.72;
      const normTheta = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      const pt = sampleKebayaTorsoPoint(normTheta, Math.max(0.015, Math.min(0.995, centerV)));
      const nrm = sampleSurfaceNormal(
        sampleKebayaTorsoPoint,
        normTheta,
        Math.max(0.015, Math.min(0.995, centerV))
      );

      // Lipatan menebal di tengah kelepak dan menutup ke tepi (lift tertinggi > panel kutubaru)
      const foldArch = Math.sin(wf * Math.PI);
      const lift = 0.008 + foldArch * 0.014;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push(s * 1.4, wf * 0.28);

      const shade = 0.87 + foldArch * 0.12;
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, widthSegs, lenSegs, side < 0);
}

export function createKebayaKutubaruPanelGeometry() {
  // Panel Kutubaru (bef) ikonik di tengah dada yang menghubungkan lapel kiri dan kanan
  const segsU = 18;
  const segsV = 24;
  const positions = [];
  const uvs = [];
  const colors = [];

  const halfAngle = 0.255;
  const vBottom = 0.385;
  const vTop = 0.755;

  for (let r = 0; r <= segsV; r++) {
    const vf = r / segsV;
    const v = vBottom + vf * (vTop - vBottom);
    for (let c = 0; c <= segsU; c++) {
      const uf = c / segsU;
      const theta = (uf * 2 - 1) * halfAngle;
      const normTheta = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      const pt = sampleKebayaTorsoPoint(normTheta, v);
      const nrm = sampleSurfaceNormal(sampleKebayaTorsoPoint, normTheta, v);

      const topLip = vf > 0.90 ? Math.sin(((vf - 0.90) / 0.10) * Math.PI) * 0.004 : 0;
      const lift = 0.011 + topLip;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push(0.92 + uf * 0.16, v * 1.65);

      const edgeAo = vf > 0.92 ? 0.88 : 0.985 - Math.abs(uf * 2 - 1) * 0.07;
      colors.push(edgeAo, edgeAo, edgeAo);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, false);
}

export function getKebayaBroochPose() {
  const v = 0.66;
  const pt = sampleKebayaTorsoPoint(0, v);
  const nrm = sampleSurfaceNormal(sampleKebayaTorsoPoint, 0, v);
  return {
    position: new THREE.Vector3(
      pt.x + nrm.x * 0.02,
      pt.y + nrm.y * 0.02,
      pt.z + nrm.z * 0.02
    ),
    normal: nrm,
  };
}

export function createKebayaSleeveGeometry(side = 1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.32, 0.50, -0.02),
    new THREE.Vector3(side * 0.53, 0.505, -0.01),
    new THREE.Vector3(side * 0.635, 0.20, 0.02),
    new THREE.Vector3(side * 0.685, -0.15, 0.08),
    new THREE.Vector3(side * 0.72, -0.44, 0.135),
  ]);

  return buildClosedRootSleeveGeometry(curve, side, {
    rPrimaryStart: 0.150,
    rPrimaryEnd: 0.088,
    rFrontStart: 0.126,
    rFrontEnd: 0.084,
    lenSegs: 44,
    radSegs: 32,
    uvScaleU: 0.9,
    uvScaleV: 1.45,
    wristPleat: false,
    cuffHemShade: true,
  });
}

export function createKebayaObiGeometry() {
  // Stagen / obi pinggang berlipit yang memeluk lingkar pinggang kebaya
  const segsU = 72;
  const segsV = 12;
  const positions = [];
  const uvs = [];
  const colors = [];

  const vMin = 0.335;
  const vMax = 0.425;

  for (let r = 0; r <= segsV; r++) {
    const vf = r / segsV;
    const v = vMin + vf * (vMax - vMin);
    for (let c = 0; c <= segsU; c++) {
      const uf = c / segsU;
      const theta = uf * Math.PI * 2;
      const pt = sampleKebayaTorsoPoint(theta, v);
      const nrm = sampleSurfaceNormal(sampleKebayaTorsoPoint, theta, v);

      const pleatWave = Math.sin(vf * Math.PI * 3.0) * 0.004;
      const edgeTaper = Math.sin(vf * Math.PI) * 0.005;
      const lift = 0.017 + edgeTaper + pleatWave;

      positions.push(pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift);
      uvs.push(uf * 2.0, vf);

      const shade = 0.88 + pleatWave * 16;
      colors.push(shade, shade, shade);
    }
  }

  return buildIndexedGridGeometry(positions, uvs, colors, segsU, segsV, false);
}

/* ============================================================================
 * 3. KAIN PANJANG & TAS TOTE BUTIK
 * ============================================================================ */

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

  return buildIndexedGridGeometry(positions, uvs, colors, radSegs, heightSegs, false);
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
