import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import {
  MessageCircle,
  Sun,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ArrowRight,
} from 'lucide-react';
import FadeIn from '../../components/FadeIn';
import ProductArtwork from './ProductArtwork';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';
import { formatRupiah, buildProductOrderWaUrl } from '../utils/helpers';
import {
  createCottonWeaveBumpTexture,
  createStudioEnvMap,
  createTailoredTorsoGeometry,
  createTailoredSleeveGeometry,
  createFoldedCollarGeometry,
  createPleatedClothGeometry,
  createSculptedToteGeometry,
  disposeGroupChildren,
} from '../utils/threeGeometries';

export default function Batik3DStudio({
  enrichedProducts,
  activeShops,
  activeProductId,
  activeModel,
  onSelectProduct,
  onSelectModel,
  onOpenBookProduct,
  getEffectiveWa,
}) {
  const [zoom, setZoom] = useState(1.0);
  const [autoRotate, setAutoRotate] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [lightMode, setLightMode] = useState('warm');
  const [studioShopFilter, setStudioShopFilter] = useState('ALL');

  const sectionRef = useRef(null);
  const viewportRef = useRef(null);
  const mountRef = useRef(null);
  const sceneStateRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    modelGroup: null,
    clothGeo: null,
    scarfGeo: null,
    batikMaterial: null,
    ambientLight: null,
    keyLight: null,
    fillLight: null,
    rimLight: null,
    targetRotY: 0.28,
    targetRotX: 0.08,
    currentRotY: 0.28,
    currentRotX: 0.08,
    targetZoom: 1.0,
    autoRotate: true,
    dragging: false,
    prevX: 0,
    prevY: 0,
  });

  const activeProduct = useMemo(() => {
    if (!enrichedProducts || enrichedProducts.length === 0) return null;
    return enrichedProducts.find((p) => p.id === activeProductId) || enrichedProducts[0];
  }, [enrichedProducts, activeProductId]);

  const filteredStudioProducts = useMemo(() => {
    if (studioShopFilter === 'ALL') return enrichedProducts;
    return enrichedProducts.filter((p) => p.shop_id === studioShopFilter);
  }, [enrichedProducts, studioShopFilter]);

  useEffect(() => {
    sceneStateRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    sceneStateRef.current.targetZoom = zoom;
  }, [zoom]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (e) => {
      e.preventDefault();
      setZoom((prev) => Math.max(0.75, Math.min(1.5, prev - e.deltaY * 0.0008)));
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    const sectionEl = sectionRef.current;
    if (!container) return;

    const state = sceneStateRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 430;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.12, 5.15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const envTexture = createStudioEnvMap(renderer);
    scene.environment = envTexture;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.HemisphereLight('#FFF8EC', '#C8B8A2', 0.9);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#FFF1D6', 1.6);
    keyLight.position.set(3.4, 5.0, 4.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#FFE4B8', 0.65);
    fillLight.position.set(-3.6, 1.4, 2.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#FFD28E', 0.65);
    rimLight.position.set(0, 3.2, -4.2);
    scene.add(rimLight);

    const floorGeo = new THREE.CircleGeometry(2.6, 48);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.22 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -1.78;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const bumpTex = createCottonWeaveBumpTexture();
    const batikMaterial = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.76,
      metalness: 0.03,
      bumpMap: bumpTex,
      bumpScale: 0.011,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;
    state.modelGroup = modelGroup;
    state.batikMaterial = batikMaterial;
    state.ambientLight = ambientLight;
    state.keyLight = keyLight;
    state.fillLight = fillLight;
    state.rimLight = rimLight;

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !state.renderer || !state.camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        state.camera.aspect = w / h;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    let rafId = null;
    let isSectionVisible = true;
    const clock = new THREE.Clock();

    const animate = () => {
      if (!isSectionVisible || document.hidden) {
        rafId = null;
        return;
      }

      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      if (state.autoRotate && !state.dragging) {
        state.targetRotY += 0.005;
      }

      state.currentRotY += (state.targetRotY - state.currentRotY) * 0.085;
      state.currentRotX += (state.targetRotX - state.currentRotX) * 0.085;

      if (state.modelGroup) {
        state.modelGroup.rotation.y = state.currentRotY;
        state.modelGroup.rotation.x = state.currentRotX;
      }

      const desiredZ = 5.15 / state.targetZoom;
      camera.position.z += (desiredZ - camera.position.z) * 0.1;

      if (state.clothGeo) {
        const pos = state.clothGeo.attributes.position;
        const { baseX, baseY } = state.clothGeo.userData;
        const heightTotal = 2.75;
        for (let i = 0; i < pos.count; i++) {
          const x = baseX[i];
          const y = baseY[i];
          const pinFactor = Math.max(0, Math.min(1, (heightTotal / 2 - y) / heightTotal));
          const pleat = Math.sin(x * 11.5) * 0.048 * (1 - pinFactor * 0.25);
          const wind1 = Math.sin(x * 2.9 + elapsed * 2.0) * 0.1;
          const wind2 = Math.cos(x * 5.4 - elapsed * 1.4 + y * 1.3) * 0.032;
          pos.setZ(i, pleat + (wind1 + wind2) * Math.pow(pinFactor, 1.15));
        }
        pos.needsUpdate = true;
        state.clothGeo.computeVertexNormals();
      }

      if (state.scarfGeo) {
        const pos = state.scarfGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const topPin = Math.max(0, Math.min(1, (1.25 - y) / 2.5));
          const pleat = Math.sin(x * 14) * 0.025;
          const sway =
            (Math.sin(y * 2.3 + elapsed * 1.9) * 0.095 + Math.cos(x * 4.2 + elapsed * 1.5) * 0.025) *
            Math.pow(topPin, 0.85);
          pos.setZ(i, pleat + sway);
        }
        pos.needsUpdate = true;
        state.scarfGeo.computeVertexNormals();
      }

      renderer.render(scene, camera);
    };

    const startRenderLoop = () => {
      if (rafId === null && isSectionVisible && !document.hidden) {
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
    };

    let io = null;
    if (sectionEl && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          isSectionVisible = Boolean(entry?.isIntersecting);
          if (isSectionVisible) {
            startRenderLoop();
          } else if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
        },
        { rootMargin: '120px 0px' }
      );
      io.observe(sectionEl);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && isSectionVisible) {
        startRenderLoop();
      } else if (document.hidden && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    startRenderLoop();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
      disposeGroupChildren(modelGroup);
      if (state.batikMaterial.map) state.batikMaterial.map.dispose();
      if (bumpTex) bumpTex.dispose();
      envTexture.dispose();
      batikMaterial.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state.ambientLight || !state.keyLight || !state.fillLight || !state.rimLight) return;
    if (lightMode === 'warm') {
      state.ambientLight.color.set('#FFF8EC');
      state.ambientLight.groundColor.set('#C8B8A2');
      state.keyLight.color.set('#FFF0D4');
      state.keyLight.intensity = 1.6;
      state.fillLight.color.set('#FFE0B2');
      state.rimLight.intensity = 0.65;
    } else if (lightMode === 'day') {
      state.ambientLight.color.set('#F4F9FF');
      state.ambientLight.groundColor.set('#B8C9D9');
      state.keyLight.color.set('#FFFFFF');
      state.keyLight.intensity = 1.7;
      state.fillLight.color.set('#DCEBFF');
      state.rimLight.intensity = 0.55;
    } else {
      state.ambientLight.color.set('#FFEAD0');
      state.ambientLight.groundColor.set('#6E5744');
      state.keyLight.color.set('#FFD99B');
      state.keyLight.intensity = 1.95;
      state.fillLight.color.set('#B38A62');
      state.rimLight.intensity = 0.95;
    }
  }, [lightMode]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state.batikMaterial || !activeProduct) return;

    const texCanvas = document.createElement('canvas');
    drawProductMotifToCanvas(texCanvas, activeProduct, 1024);

    const newTexture = new THREE.CanvasTexture(texCanvas);
    newTexture.colorSpace = THREE.SRGBColorSpace;
    newTexture.wrapS = THREE.RepeatWrapping;
    newTexture.wrapT = THREE.RepeatWrapping;
    newTexture.anisotropy = 8;
    newTexture.repeat.set(activeModel === 'fabric' ? 1.35 : 1.7, activeModel === 'fabric' ? 1.5 : 1.7);
    newTexture.needsUpdate = true;

    const oldTexture = state.batikMaterial.map;
    state.batikMaterial.map = newTexture;
    state.batikMaterial.needsUpdate = true;
    if (oldTexture) oldTexture.dispose();
  }, [activeProduct, activeModel]);

  useEffect(() => {
    const state = sceneStateRef.current;
    const group = state.modelGroup;
    const batikMat = state.batikMaterial;
    if (!group || !batikMat) return;

    disposeGroupChildren(group);
    state.clothGeo = null;
    state.scarfGeo = null;

    const jatiWoodMat = new THREE.MeshStandardMaterial({
      color: '#3B2314',
      roughness: 0.36,
      metalness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#D4A038',
      roughness: 0.24,
      metalness: 0.88,
    });
    const saddleLeatherMat = new THREE.MeshStandardMaterial({
      color: '#5A2A14',
      roughness: 0.45,
      metalness: 0.08,
    });
    const suedeLiningMat = new THREE.MeshStandardMaterial({
      color: '#231812',
      roughness: 0.92,
      metalness: 0.0,
    });
    const collarInnerMat = new THREE.MeshStandardMaterial({
      color: '#2A1E17',
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    if (activeModel === 'shirt') {
      const torsoGeo = createTailoredTorsoGeometry();
      const torsoMesh = new THREE.Mesh(torsoGeo, batikMat);
      torsoMesh.position.y = 0.16;
      torsoMesh.castShadow = true;
      torsoMesh.receiveShadow = true;
      group.add(torsoMesh);

      const collarStandGeo = new THREE.CylinderGeometry(0.245, 0.265, 0.14, 40, 1, true);
      const collarStand = new THREE.Mesh(collarStandGeo, collarInnerMat);
      collarStand.position.set(0, 1.12, 0.02);
      collarStand.rotation.x = 0.08;
      group.add(collarStand);

      const foldedCollarGeo = createFoldedCollarGeometry();
      const foldedCollar = new THREE.Mesh(foldedCollarGeo, batikMat);
      foldedCollar.position.set(0, 0.16, 0);
      foldedCollar.castShadow = true;
      group.add(foldedCollar);

      const placketCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.04, 0.26),
        new THREE.Vector3(0, 0.76, 0.415),
        new THREE.Vector3(0, 0.45, 0.422),
        new THREE.Vector3(0, 0.12, 0.382),
        new THREE.Vector3(0, -0.25, 0.355),
        new THREE.Vector3(0, -0.74, 0.372),
      ]);
      const placketTube = new THREE.TubeGeometry(placketCurve, 32, 0.045, 8, false);
      placketTube.scale(1.15, 1, 0.25);
      const placketMesh = new THREE.Mesh(placketTube, batikMat);
      group.add(placketMesh);

      const btnGeo = new THREE.SphereGeometry(0.022, 16, 12);
      btnGeo.scale(1, 1, 0.42);
      for (let b = 0; b < 6; b++) {
        const t = 0.08 + b * 0.165;
        const pt = placketCurve.getPointAt(t);
        const btn = new THREE.Mesh(btnGeo, brassMat);
        btn.position.set(pt.x, pt.y, pt.z + 0.012);
        group.add(btn);
      }

      const pocketGroup = new THREE.Group();
      const pocketShape = new THREE.Shape();
      pocketShape.moveTo(-0.11, 0.13);
      pocketShape.lineTo(0.11, 0.13);
      pocketShape.lineTo(0.11, -0.09);
      pocketShape.lineTo(0, -0.14);
      pocketShape.lineTo(-0.11, -0.09);
      pocketShape.closePath();

      const pocketGeo = new THREE.ExtrudeGeometry(pocketShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.004,
        bevelSegments: 2,
      });
      const pocketMesh = new THREE.Mesh(pocketGeo, batikMat);
      pocketGroup.add(pocketMesh);

      const pocketLip = new THREE.Mesh(new THREE.BoxGeometry(0.224, 0.026, 0.018), collarInnerMat);
      pocketLip.position.set(0, 0.115, 0.008);
      pocketGroup.add(pocketLip);

      pocketGroup.position.set(0.27, 0.62, 0.372);
      pocketGroup.rotation.y = 0.38;
      pocketGroup.rotation.x = -0.05;
      group.add(pocketGroup);

      [-1, 1].forEach((side) => {
        const sleeveGeo = createTailoredSleeveGeometry(side);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, batikMat);
        sleeveMesh.position.y = 0.16;
        sleeveMesh.castShadow = true;
        sleeveMesh.receiveShadow = true;
        group.add(sleeveMesh);

        const cuffGeo = new THREE.CylinderGeometry(0.128, 0.124, 0.13, 28);
        const cuffMesh = new THREE.Mesh(cuffGeo, collarInnerMat);
        cuffMesh.position.set(side * 0.995, -0.32, 0.175);
        cuffMesh.rotation.z = side * 0.14;
        cuffMesh.rotation.x = 0.22;
        cuffMesh.castShadow = true;
        group.add(cuffMesh);

        const cuffBtn = new THREE.Mesh(btnGeo, brassMat);
        cuffBtn.position.set(side * 1.11, -0.32, 0.19);
        cuffBtn.rotation.y = side * 1.4;
        group.add(cuffBtn);
      });

      const neckFinialPoints = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.22, 0),
        new THREE.Vector2(0.23, 0.04),
        new THREE.Vector2(0.14, 0.09),
        new THREE.Vector2(0.08, 0.15),
        new THREE.Vector2(0.11, 0.19),
        new THREE.Vector2(0, 0.22),
      ];
      const neckCap = new THREE.Mesh(new THREE.LatheGeometry(neckFinialPoints, 32), jatiWoodMat);
      neckCap.position.set(0, 1.16, 0.02);
      group.add(neckCap);

      const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 1.05, 24), brassMat);
      standPole.position.y = -1.24;
      group.add(standPole);

      const basePoints = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.58, 0),
        new THREE.Vector2(0.56, 0.05),
        new THREE.Vector2(0.46, 0.08),
        new THREE.Vector2(0.14, 0.11),
        new THREE.Vector2(0, 0.11),
      ];
      const standBase = new THREE.Mesh(new THREE.LatheGeometry(basePoints, 40), jatiWoodMat);
      standBase.position.y = -1.78;
      standBase.receiveShadow = true;
      group.add(standBase);
    } else if (activeModel === 'fabric') {
      const rodGeo = new THREE.CylinderGeometry(0.052, 0.052, 2.86, 28);
      rodGeo.rotateZ(Math.PI / 2);
      const rodMesh = new THREE.Mesh(rodGeo, jatiWoodMat);
      rodMesh.position.y = 1.42;
      rodMesh.castShadow = true;
      group.add(rodMesh);

      const finialPts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.075, 0),
        new THREE.Vector2(0.095, 0.05),
        new THREE.Vector2(0.06, 0.11),
        new THREE.Vector2(0.085, 0.16),
        new THREE.Vector2(0, 0.22),
      ];
      const finialGeo = new THREE.LatheGeometry(finialPts, 28);
      [-1, 1].forEach((dir) => {
        const finial = new THREE.Mesh(finialGeo, brassMat);
        finial.rotation.z = -dir * (Math.PI / 2);
        finial.position.set(dir * 1.42, 1.42, 0);
        group.add(finial);
      });

      const clothGeo = createPleatedClothGeometry();
      const clothMesh = new THREE.Mesh(clothGeo, batikMat);
      clothMesh.position.y = 0.03;
      clothMesh.castShadow = true;
      clothMesh.receiveShadow = true;
      group.add(clothMesh);
      state.clothGeo = clothGeo;

      const hemTrim = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.035, 0.02), brassMat);
      hemTrim.position.set(0, -1.34, 0);
      group.add(hemTrim);
    } else {
      const bagGroup = new THREE.Group();
      bagGroup.position.set(-0.4, -0.26, 0.08);
      bagGroup.rotation.y = 0.24;

      const bagBodyGeo = createSculptedToteGeometry();
      const bagBody = new THREE.Mesh(bagBodyGeo, batikMat);
      bagBody.castShadow = true;
      bagBody.receiveShadow = true;
      bagGroup.add(bagBody);

      const interiorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.12, 0.34), suedeLiningMat);
      interiorMesh.position.y = 0.69;
      bagGroup.add(interiorMesh);

      const bagBottom = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.15, 0.44), saddleLeatherMat);
      bagBottom.position.y = -0.69;
      bagGroup.add(bagBottom);

      [
        [-0.48, -0.14],
        [0.48, -0.14],
        [-0.48, 0.14],
        [0.48, 0.14],
      ].forEach(([fx, fz]) => {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.04, 16), brassMat);
        foot.position.set(fx, -0.78, fz);
        bagGroup.add(foot);
      });

      [-0.18, 0.18].forEach((zOffset) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.36, 0.72, zOffset),
          new THREE.Vector3(-0.31, 1.32, zOffset * 1.05),
          new THREE.Vector3(0.31, 1.32, zOffset * 1.05),
          new THREE.Vector3(0.36, 0.72, zOffset),
        ]);
        const handleGeo = new THREE.TubeGeometry(curve, 32, 0.028, 14, false);
        const handleMesh = new THREE.Mesh(handleGeo, saddleLeatherMat);
        handleMesh.castShadow = true;
        bagGroup.add(handleMesh);

        [-0.36, 0.36].forEach((xAnchor) => {
          const tab = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.02), saddleLeatherMat);
          tab.position.set(xAnchor, 0.67, zOffset + (zOffset > 0 ? 0.015 : -0.015));
          bagGroup.add(tab);

          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), brassMat);
          stud.position.set(xAnchor, 0.65, zOffset + (zOffset > 0 ? 0.028 : -0.028));
          bagGroup.add(stud);
        });
      });

      group.add(bagGroup);

      const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 14, 32), brassMat);
      scarfRing.position.set(0.76, 1.28, -0.04);
      scarfRing.rotation.y = -0.25;
      group.add(scarfRing);

      const scarfGeo = new THREE.PlaneGeometry(0.64, 2.5, 28, 60);
      const scarfColors = new Float32Array(scarfGeo.attributes.position.count * 3).fill(0.96);
      scarfGeo.setAttribute('color', new THREE.BufferAttribute(scarfColors, 3));

      const scarfMesh = new THREE.Mesh(scarfGeo, batikMat);
      scarfMesh.position.set(0.76, 0.02, -0.04);
      scarfMesh.rotation.set(0.04, -0.26, -0.07);
      scarfMesh.castShadow = true;
      scarfMesh.receiveShadow = true;
      group.add(scarfMesh);
      state.scarfGeo = scarfGeo;
    }

    return () => {
      jatiWoodMat.dispose();
      brassMat.dispose();
      saddleLeatherMat.dispose();
      suedeLiningMat.dispose();
      collarInnerMat.dispose();
    };
  }, [activeModel]);

  if (!enrichedProducts || enrichedProducts.length === 0 || !activeProduct) return null;

  const handlePointerDown = (e) => {
    sceneStateRef.current.dragging = true;
    sceneStateRef.current.prevX = e.clientX;
    sceneStateRef.current.prevY = e.clientY;
  };

  const handlePointerMove = (e) => {
    const state = sceneStateRef.current;
    if (!state.dragging) return;
    const dx = e.clientX - state.prevX;
    const dy = e.clientY - state.prevY;
    state.prevX = e.clientX;
    state.prevY = e.clientY;
    state.targetRotY += dx * 0.011;
    state.targetRotX = Math.max(-0.55, Math.min(0.55, state.targetRotX + dy * 0.008));
  };

  const handlePointerUp = () => {
    sceneStateRef.current.dragging = false;
  };

  const effectiveWa = getEffectiveWa(activeProduct.shop.id, activeProduct.shop.number);
  const modelName =
    activeModel === 'shirt'
      ? 'Kemeja Batik Tailored'
      : activeModel === 'fabric'
      ? 'Kain Panjang Gawangan'
      : 'Tas Butik & Selendang';
  const waHref = buildProductOrderWaUrl(
    activeProduct.shop,
    effectiveWa,
    activeProduct,
    `Studio Mockup 3D (${modelName})`
  );

  return (
    <section
      ref={sectionRef}
      id="mockup-3d"
      className="relative overflow-hidden py-16 lg:py-24 bg-[#EFEAE0] border-t border-[#1C1917]/12"
    >
      <img
        src="/ornaments/mega-mendung-maroon.png"
        alt=""
        aria-hidden="true"
        className="hidden md:block pointer-events-none select-none absolute -top-6 -right-14 w-[380px] lg:w-[500px] opacity-[0.13]"
      />
      <img
        src="/ornaments/kawung-sogan.png"
        alt=""
        aria-hidden="true"
        className="hidden lg:block pointer-events-none select-none absolute -bottom-10 -left-10 w-64 lg:w-80 opacity-[0.11]"
      />
      <div className="taste-wrap relative z-10">
        <FadeIn className="max-w-3xl mb-8">
          <h2 className="font-serif font-normal text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
            Studio Mockup 3D Batik Trenggalek
          </h2>
          <p className="text-[15px] text-[#575049] mt-2 leading-relaxed">
            Simulasikan motif pada kemeja tailored, kain panjang wiru, atau tas butik sebelum
            memesan ke sanggar.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <FadeIn
            variant="scale"
            delay={100}
            className="lg:col-span-7 bg-[#FCFBF8] rounded-xl border border-[#1C1917]/12 p-4 sm:p-5 flex flex-col justify-between gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex flex-wrap gap-1 bg-[#EFEAE0] p-1 rounded-xl border border-[#1C1917]/12">
                {[
                  { id: 'shirt', label: 'Kemeja Tailored' },
                  { id: 'fabric', label: 'Kain Panjang' },
                  { id: 'tote', label: 'Tas & Selendang' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectModel(tab.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-colors cursor-pointer ${
                      activeModel === tab.id
                        ? 'bg-[#7C3219] text-white'
                        : 'text-[#575049] hover:text-[#1C1917]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setLightMode((m) => (m === 'warm' ? 'day' : m === 'day' ? 'boutique' : 'warm'))
                  }
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[#1C1917] text-[13px] font-medium cursor-pointer"
                >
                  <Sun className="w-3.5 h-3.5 text-[#7C3219]" />
                  <span>
                    {lightMode === 'warm'
                      ? 'Galeri Hangat'
                      : lightMode === 'day'
                      ? 'Siang Cerah'
                      : 'Sorot Butik'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-[10px] border text-[13px] font-medium cursor-pointer transition-colors ${
                    autoRotate
                      ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                      : 'bg-[#F7F4EE] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
                  }`}
                >
                  Auto-Putar: {autoRotate ? 'Aktif' : 'Jeda'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sceneStateRef.current.targetRotY = 0.28;
                    sceneStateRef.current.targetRotX = 0.08;
                    setZoom(1.0);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[#575049] hover:text-[#1C1917] text-[13px] font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div
              ref={viewportRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`relative rounded-xl overflow-hidden border border-[#1C1917]/12 h-[380px] sm:h-[440px] select-none touch-none cursor-grab active:cursor-grabbing ${
                lightMode === 'warm'
                  ? 'bg-gradient-to-b from-[#EDE5D7] via-[#E3D9C7] to-[#D4C6B1]'
                  : lightMode === 'day'
                  ? 'bg-gradient-to-b from-[#EDF2F7] via-[#E2EAF2] to-[#CFDCE8]'
                  : 'bg-[#1F1814]'
              }`}
            >
              <div ref={mountRef} className="w-full h-full" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <ZoomOut className="w-4 h-4 text-[#575049] shrink-0" />
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-[#7C3219] cursor-pointer"
                  aria-label="Zoom 3D Mockup"
                />
                <ZoomIn className="w-4 h-4 text-[#575049] shrink-0" />
              </div>
              <p className="text-[13px] text-[#575049] text-center">
                Seret untuk memutar 360° · Gulir atau geser kontrol untuk memperbesar
              </p>
            </div>
          </FadeIn>

          <FadeIn
            delay={200}
            className="lg:col-span-5 bg-[#FCFBF8] rounded-xl border border-[#1C1917]/12 p-5 sm:p-6 flex flex-col justify-between gap-5"
          >
            <div className="space-y-5">
              <div>
                <span className="text-[13px] font-medium text-[#7C3219] block mb-2.5">
                  Pilih sanggar &amp; motif ({filteredStudioProducts.length} koleksi)
                </span>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    type="button"
                    onClick={() => setStudioShopFilter('ALL')}
                    className={`min-h-[38px] px-3 py-1.5 rounded-[10px] text-[13px] font-medium border transition-colors cursor-pointer ${
                      studioShopFilter === 'ALL'
                        ? 'bg-[#7C3219] text-white border-[#7C3219]'
                        : 'bg-[#F7F4EE] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
                    }`}
                  >
                    Semua Sanggar
                  </button>
                  {activeShops.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudioShopFilter(s.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-[10px] text-[13px] font-medium border transition-colors cursor-pointer ${
                        studioShopFilter === s.id
                          ? 'bg-[#7C3219] text-white border-[#7C3219]'
                          : 'bg-[#F7F4EE] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {filteredStudioProducts.map((prod) => {
                    const isSelected = prod.id === activeProduct.id;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => onSelectProduct(prod.id)}
                        className={`p-2 rounded-[10px] border text-left transition-colors flex items-center gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'border-[#7C3219] bg-[#F7F4EE] ring-1 ring-[#7C3219]/25'
                            : 'border-[#1C1917]/12 bg-[#FCFBF8] hover:border-[#1C1917]/30'
                        }`}
                      >
                        <ProductArtwork
                          product={prod}
                          imageUrl={prod.primaryImageUrl}
                          size={72}
                          className="w-10 h-10 rounded-sm shrink-0 border border-[#1C1917]/12"
                        />
                        <div className="min-w-0">
                          <span
                            className={`block text-[13px] font-medium truncate ${
                              isSelected ? 'text-[#7C3219]' : 'text-[#1C1917]'
                            }`}
                          >
                            {prod.name}
                          </span>
                          <span className="block text-[13px] text-[#575049] truncate">
                            {prod.shop.name}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[#1C1917]/12 pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[13px] font-medium text-[#7C3219] block">
                      {activeProduct.shop.name} · {activeProduct.category.name}
                    </span>
                    <h3 className="font-serif font-normal text-[22px] text-[#1C1917] leading-snug mt-0.5">
                      {activeProduct.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenBookProduct(activeProduct.shop.id, activeProduct.id)}
                    className="taste-link shrink-0 text-[13px] font-medium text-[#7C3219] min-h-[38px] cursor-pointer"
                  >
                    <span>Buka di Buku</span>
                    <ArrowRight className="w-3.5 h-3.5 m-arrow" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2.5 border-y border-[#1C1917]/12">
                  <span className="text-[13px] text-[#575049]">Harga resmi produk</span>
                  <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums">
                    {formatRupiah(activeProduct.price)}
                  </span>
                </div>

                <dl className="divide-y divide-[#1C1917]/10 text-[13px]">
                  {activeProduct.formattedAttributes.slice(0, 4).map((attr) => (
                    <div key={attr.name} className="py-2 flex items-center justify-between gap-3">
                      <dt className="text-[#575049]">{attr.label}</dt>
                      <dd className="font-medium text-[#1C1917] text-right truncate">
                        {attr.displayValue}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-[#1C1917]/12">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-wa w-full"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Pesan Produk Ini via WhatsApp</span>
              </a>
              <p className="text-[13px] text-center text-[#575049] tabular-nums">
                Detail produk dikirim langsung ke WhatsApp +{effectiveWa}
              </p>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}