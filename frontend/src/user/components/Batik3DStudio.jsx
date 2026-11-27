// frontend/src/user/components/Batik3DStudio.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import {
  resolveBackendMediaUrl,
  fetchBackendMediaBlobUrl,
} from '../../utils/url_controller';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';
import { formatRupiah, buildProductOrderWaUrl } from '../utils/helpers';
import {
  createCottonWeaveBumpTexture,
  createStudioEnvMap,
  createTailoredTorsoGeometry,
  createCollarStandGeometry,
  createFoldedCollarGeometry,
  createShirtPlacketGeometry,
  getShirtButtonPoses,
  createShirtPocketGeometry,
  createBackYokeSeamGeometry,
  createTailoredSleeveGeometry,
  createShirtCuffGeometry,
  createKebayaTorsoGeometry,
  createKebayaLapelGeometry,
  createKebayaKutubaruPanelGeometry,
  getKebayaBroochPose,
  createKebayaSleeveGeometry,
  createKebayaObiGeometry,
  createPleatedClothGeometry,
  createSculptedToteGeometry,
  disposeGroupChildren,
} from '../utils/threeGeometries';

const BASE_MODEL_REPEAT = {
  shirt: 1.35,
  kebaya: 1.4,
  fabric: 1.05,
  tote: 1.25,
};

function applyTextureMapping(texture, { model, scale, aspect }) {
  if (!texture) return;

  const safeAspect = Math.max(0.35, Math.min(2.8, Number(aspect) || 1));
  const sqrtAspect = Math.sqrt(safeAspect);
  const base = (BASE_MODEL_REPEAT[model] || 1.25) * (Number(scale) || 1.0);

  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(base / sqrtAspect, base * sqrtAspect);
  texture.needsUpdate = true;
}

function resolveProductMockupUrl(product) {
  if (!product) return '';
  const raw =
    product.mockupImageUrl ||
    product.mockupImage?.public_url ||
    product.mockup_image?.public_url ||
    product.mockupImage?.image_url ||
    product.mockup_image?.image_url ||
    '';
  return resolveBackendMediaUrl(raw);
}

function resolveProductDisplayUrl(product) {
  if (!product) return '';
  const raw =
    product.primaryImageUrl ||
    product.displayImages?.[0]?.public_url ||
    product.displayImages?.[0]?.image_url ||
    '';
  return resolveBackendMediaUrl(raw);
}

function loadThreeTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

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
  const [textureScale, setTextureScale] = useState(1.0);
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
    textureAspect: 1.0,
    targetRotY: 0.28,
    targetRotX: 0.08,
    currentRotY: 0.28,
    currentRotX: 0.08,
    targetZoom: 1.0,
    autoRotate: true,
    dragging: false,
    prevX: 0,
    prevY: 0,
    activePointers: new Map(),
    pinchStartDist: 0,
    pinchStartZoom: 1.0,
  });

  const activeProduct = useMemo(() => {
    if (!enrichedProducts || enrichedProducts.length === 0) return null;
    return enrichedProducts.find((p) => p.id === activeProductId) || enrichedProducts[0];
  }, [enrichedProducts, activeProductId]);

  const filteredStudioProducts = useMemo(() => {
    if (studioShopFilter === 'ALL') return enrichedProducts;
    return enrichedProducts.filter((p) => p.shop_id === studioShopFilter);
  }, [enrichedProducts, studioShopFilter]);

  const mappingConfigRef = useRef({
    model: activeModel,
    scale: textureScale,
  });

  useEffect(() => {
    mappingConfigRef.current = {
      model: activeModel,
      scale: textureScale,
    };
  }, [activeModel, textureScale]);

  const swapMaterialTexture = useCallback((nextTexture, aspectRatio = 1.0) => {
    const state = sceneStateRef.current;
    if (!state.batikMaterial) {
      nextTexture.dispose();
      return;
    }

    const maxAniso = state.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.anisotropy = Math.min(8, maxAniso);

    state.textureAspect = aspectRatio;
    applyTextureMapping(nextTexture, {
      ...mappingConfigRef.current,
      aspect: aspectRatio,
    });

    const oldTexture = state.batikMaterial.map;
    state.batikMaterial.map = nextTexture;
    state.batikMaterial.needsUpdate = true;
    if (oldTexture && oldTexture !== nextTexture) {
      oldTexture.dispose();
    }

    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
  }, []);

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
    const onTouchMoveNative = (e) => {
      if (e.touches && e.touches.length >= 2) {
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    el.addEventListener('touchmove', onTouchMoveNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
      el.removeEventListener('touchmove', onTouchMoveNative);
    };
  }, []);

  // Inisialisasi WebGLRenderer, Scene, Lighting & Render Loop
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

  // Pencahayaan studio
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

  // Muat tekstur asli lewat url_controller (Prioritas: mockup_image -> display_images[0] -> kanvas prosedural)
  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state.batikMaterial || !activeProduct) return;

    let cancelled = false;
    const abortController = new AbortController();

    // 1. Pasang kanvas prosedural seketika sebagai placeholder agar model 3D tidak pernah blank
    const fallbackCanvas = document.createElement('canvas');
    drawProductMotifToCanvas(fallbackCanvas, activeProduct, 1024);
    const canvasTexture = new THREE.CanvasTexture(fallbackCanvas);
    swapMaterialTexture(canvasTexture, 1.0);

    // 2. Susun kandidat gambar ternormalisasi sesuai BACKEND_MODE di url_controller
    const mockupUrl = resolveProductMockupUrl(activeProduct);
    const displayUrl = resolveProductDisplayUrl(activeProduct);

    const candidates = [];
    if (mockupUrl) candidates.push(mockupUrl);
    if (displayUrl && displayUrl !== mockupUrl) {
      candidates.push(displayUrl);
    }

    if (candidates.length === 0) {
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const loadCandidates = async () => {
      for (const url of candidates) {
        if (cancelled) return;
        let revoke = null;
        try {
          // Tarik via backendFetch -> Blob URL agar membawa header ngrok-skip-browser-warning
          const media = await fetchBackendMediaBlobUrl(url, {
            signal: abortController.signal,
          });
          revoke = media.revoke;

          if (cancelled) {
            revoke();
            return;
          }

          const loadedTex = await loadThreeTexture(loader, media.url);
          if (cancelled) {
            loadedTex.dispose();
            revoke();
            return;
          }

          const img = loadedTex.image;
          const aspect =
            img && img.width > 0 && img.height > 0 ? img.width / img.height : 1.0;

          swapMaterialTexture(loadedTex, aspect);
          revoke();
          revoke = null;
          return;
        } catch (err) {
          if (revoke) revoke();
          if (cancelled || err?.name === 'AbortError') return;
          // Jika kandidat ini gagal dimuat (404/network/decode), coba kandidat berikutnya
        }
      }
    };

    loadCandidates();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeProduct, swapMaterialTexture]);

  // Perbarui skala repeat tekstur secara instan tanpa memuat ulang gambar
  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state.batikMaterial?.map) return;

    applyTextureMapping(state.batikMaterial.map, {
      model: activeModel,
      scale: textureScale,
      aspect: state.textureAspect,
    });
    state.batikMaterial.needsUpdate = true;

    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
  }, [activeModel, textureScale]);

  // Bangun geometri 3D sesuai model pilihan
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
    const shirtButtonMat = new THREE.MeshStandardMaterial({
      color: '#2B211B',
      roughness: 0.24,
      metalness: 0.16,
    });
    const obiSilkMat = new THREE.MeshStandardMaterial({
      color: '#4E1D13',
      roughness: 0.44,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });

    const addMannequinBase = (neckRadiusTop = 0.185, neckHeight = 0.18, neckY = 1.03) => {
      const innerNeck = new THREE.Mesh(
        new THREE.CylinderGeometry(neckRadiusTop, neckRadiusTop + 0.015, neckHeight, 32),
        suedeLiningMat
      );
      innerNeck.position.set(0, neckY, 0.005);
      group.add(innerNeck);

      const neckCapPoints = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(neckRadiusTop, 0),
        new THREE.Vector2(neckRadiusTop * 1.02, 0.025),
        new THREE.Vector2(neckRadiusTop * 0.62, 0.055),
        new THREE.Vector2(neckRadiusTop * 0.42, 0.085),
        new THREE.Vector2(0, 0.105),
      ];
      const neckCap = new THREE.Mesh(new THREE.LatheGeometry(neckCapPoints, 32), jatiWoodMat);
      neckCap.position.set(0, neckY + neckHeight * 0.48, 0.005);
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
    };

    if (activeModel === 'shirt') {
      const yOffset = 0.16;

      const torsoMesh = new THREE.Mesh(createTailoredTorsoGeometry(), batikMat);
      torsoMesh.position.y = yOffset;
      torsoMesh.castShadow = true;
      torsoMesh.receiveShadow = true;
      group.add(torsoMesh);

      const collarStand = new THREE.Mesh(createCollarStandGeometry(), batikMat);
      collarStand.position.y = yOffset;
      collarStand.castShadow = true;
      collarStand.receiveShadow = true;
      group.add(collarStand);

      const foldedCollar = new THREE.Mesh(createFoldedCollarGeometry(), batikMat);
      foldedCollar.position.y = yOffset;
      foldedCollar.castShadow = true;
      foldedCollar.receiveShadow = true;
      group.add(foldedCollar);

      const placketMesh = new THREE.Mesh(createShirtPlacketGeometry(), batikMat);
      placketMesh.position.y = yOffset;
      placketMesh.castShadow = true;
      placketMesh.receiveShadow = true;
      group.add(placketMesh);

      const pocketMesh = new THREE.Mesh(createShirtPocketGeometry(), batikMat);
      pocketMesh.position.y = yOffset;
      pocketMesh.castShadow = true;
      pocketMesh.receiveShadow = true;
      group.add(pocketMesh);

      const backYokeMesh = new THREE.Mesh(createBackYokeSeamGeometry(), batikMat);
      backYokeMesh.position.y = yOffset;
      group.add(backYokeMesh);

      const upAxis = new THREE.Vector3(0, 1, 0);
      const shirtBtnGeo = new THREE.CylinderGeometry(0.017, 0.0185, 0.006, 20);
      getShirtButtonPoses().forEach(({ position, normal }) => {
        const btn = new THREE.Mesh(shirtBtnGeo, shirtButtonMat);
        btn.position.set(position.x, position.y + yOffset, position.z);
        btn.quaternion.setFromUnitVectors(upAxis, normal);
        group.add(btn);
      });

      [-1, 1].forEach((side) => {
        const sleeveMesh = new THREE.Mesh(createTailoredSleeveGeometry(side), batikMat);
        sleeveMesh.position.y = yOffset;
        sleeveMesh.castShadow = true;
        sleeveMesh.receiveShadow = true;
        group.add(sleeveMesh);

        const cuffData = createShirtCuffGeometry(side);
        const cuffMesh = new THREE.Mesh(cuffData.geometry, batikMat);
        cuffMesh.position.y = yOffset;
        cuffMesh.castShadow = true;
        cuffMesh.receiveShadow = true;
        group.add(cuffMesh);

        const cuffBtn = new THREE.Mesh(shirtBtnGeo, shirtButtonMat);
        cuffBtn.position.set(
          cuffData.buttonPosition.x,
          cuffData.buttonPosition.y + yOffset,
          cuffData.buttonPosition.z
        );
        cuffBtn.quaternion.setFromUnitVectors(upAxis, cuffData.buttonNormal);
        group.add(cuffBtn);
      });

      addMannequinBase(0.19, 0.16, 1.08);
    } else if (activeModel === 'kebaya') {
      const yOffset = 0.16;

      const kebayaTorso = new THREE.Mesh(createKebayaTorsoGeometry(), batikMat);
      kebayaTorso.position.y = yOffset;
      kebayaTorso.castShadow = true;
      kebayaTorso.receiveShadow = true;
      group.add(kebayaTorso);

      [-1, 1].forEach((side) => {
        const lapelMesh = new THREE.Mesh(createKebayaLapelGeometry(side), batikMat);
        lapelMesh.position.y = yOffset;
        lapelMesh.castShadow = true;
        lapelMesh.receiveShadow = true;
        group.add(lapelMesh);

        const sleeveMesh = new THREE.Mesh(createKebayaSleeveGeometry(side), batikMat);
        sleeveMesh.position.y = yOffset;
        sleeveMesh.castShadow = true;
        sleeveMesh.receiveShadow = true;
        group.add(sleeveMesh);
      });

      const kutubaruPanel = new THREE.Mesh(createKebayaKutubaruPanelGeometry(), batikMat);
      kutubaruPanel.position.y = yOffset;
      kutubaruPanel.castShadow = true;
      kutubaruPanel.receiveShadow = true;
      group.add(kutubaruPanel);

      const obiMesh = new THREE.Mesh(createKebayaObiGeometry(), obiSilkMat);
      obiMesh.position.y = yOffset;
      obiMesh.castShadow = true;
      obiMesh.receiveShadow = true;
      group.add(obiMesh);

      // Bros Kebaya Keraton 3 susun di tengah panel Kutubaru
      const broochPose = getKebayaBroochPose();
      const broochGroup = new THREE.Group();
      broochGroup.position.set(
        broochPose.position.x,
        broochPose.position.y + yOffset,
        broochPose.position.z
      );
      broochGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), broochPose.normal);

      [
        { y: 0.036, r: 0.026 },
        { y: -0.008, r: 0.020 },
        { y: -0.044, r: 0.015 },
      ].forEach(({ y, r }) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0045, 10, 24), brassMat);
        rim.position.y = y;
        broochGroup.add(rim);

        const gem = new THREE.Mesh(new THREE.SphereGeometry(r * 0.65, 16, 12), brassMat);
        gem.scale.set(1, 1, 0.45);
        gem.position.set(0, y, 0.002);
        broochGroup.add(gem);
      });
      group.add(broochGroup);

      addMannequinBase(0.16, 0.30, 0.96);
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
      shirtButtonMat.dispose();
      obiSilkMat.dispose();
    };
  }, [activeModel]);

  if (!enrichedProducts || enrichedProducts.length === 0 || !activeProduct) return null;

  const handlePointerDown = (e) => {
    const state = sceneStateRef.current;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.activePointers.size === 1) {
      state.dragging = true;
      state.prevX = e.clientX;
      state.prevY = e.clientY;
    } else if (state.activePointers.size === 2) {
      state.dragging = false;
      const [p1, p2] = Array.from(state.activePointers.values());
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      state.pinchStartDist = Math.max(dist, 1);
      state.pinchStartZoom = state.targetZoom;
    }
  };

  const handlePointerMove = (e) => {
    const state = sceneStateRef.current;
    if (!state.activePointers.has(e.pointerId)) return;
    state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.activePointers.size >= 2) {
      if (state.pinchStartDist > 0) {
        const [p1, p2] = Array.from(state.activePointers.values());
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const nextZoom = Math.max(
          0.75,
          Math.min(1.5, state.pinchStartZoom * (dist / state.pinchStartDist))
        );
        state.targetZoom = nextZoom;
        setZoom(Math.round(nextZoom * 100) / 100);
      }
      return;
    }

    if (!state.dragging) return;
    const dx = e.clientX - state.prevX;
    const dy = e.clientY - state.prevY;
    state.prevX = e.clientX;
    state.prevY = e.clientY;
    state.targetRotY += dx * 0.011;
    state.targetRotX = Math.max(-0.55, Math.min(0.55, state.targetRotX + dy * 0.008));
  };

  const handlePointerUp = (e) => {
    const state = sceneStateRef.current;
    if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    state.activePointers.delete(e.pointerId);

    if (state.activePointers.size < 2) {
      state.pinchStartDist = 0;
    }
    if (state.activePointers.size === 1) {
      const [remaining] = state.activePointers.values();
      state.prevX = remaining.x;
      state.prevY = remaining.y;
      state.dragging = true;
    } else if (state.activePointers.size === 0) {
      state.dragging = false;
    }
  };

  const effectiveWa = getEffectiveWa(activeProduct.shop.id, activeProduct.shop.number);
  const modelName =
    activeModel === 'shirt'
      ? 'Kemeja Batik'
      : activeModel === 'kebaya'
      ? 'Kebaya Batik'
      : activeModel === 'fabric'
      ? 'Kain Panjang'
      : 'Tas & Selendang';
  const waHref = effectiveWa
    ? buildProductOrderWaUrl(
        activeProduct.shop,
        effectiveWa,
        activeProduct,
        `Studio Mockup 3D (${modelName})`
      )
    : '';

  return (
    <section
      ref={sectionRef}
      id="mockup-3d"
      className="relative overflow-hidden py-10 lg:py-12 bg-[#EFEAE0] border-t border-[#1C1917]/12"
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
        <FadeIn className="max-w-3xl mb-6">
          <h2 className="font-serif font-normal text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
            Studio Mockup 3D Batik Trenggalek
          </h2>
          <p className="text-[15px] text-[#575049] mt-2 leading-relaxed">
            Simulasikan motif kain asli sanggar pada kemeja, kebaya, kain panjang, atau tas &amp;
            selendang sebelum memesan lewat WhatsApp.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <FadeIn
            variant="scale"
            delay={100}
            className="lg:col-span-7 bg-[#FCFBF8] rounded-xl border border-[#1C1917]/12 p-4 sm:p-5 flex flex-col gap-3.5"
          >
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  { id: 'fabric', label: 'Kain Panjang' },
                  { id: 'shirt', label: 'Kemeja' },
                  { id: 'kebaya', label: 'Kebaya' },
                  { id: 'tote', label: 'Tas & Selendang' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectModel(tab.id)}
                    className={`min-h-[40px] px-4 py-2 rounded-[10px] text-[13.5px] font-medium border transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                      activeModel === tab.id
                        ? 'bg-[#7C3219] text-white border-[#7C3219] shadow-xs'
                        : 'bg-[#F7F4EE] text-[#575049] border-[#1C1917]/15 hover:border-[#7C3219]/40 hover:text-[#1C1917] hover:bg-[#EFEAE0]/70'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setLightMode((m) => (m === 'warm' ? 'day' : m === 'day' ? 'boutique' : 'warm'))
                  }
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-[9px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[#1C1917] text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer"
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
                  className={`min-h-[36px] px-3 py-1.5 rounded-[9px] border text-[12.5px] font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                    autoRotate
                      ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                      : 'bg-[#F7F4EE] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:bg-[#EFEAE0]'
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
                    setTextureScale(1.0);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-[9px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[#575049] hover:text-[#1C1917] text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer"
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
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
              className={`relative flex-1 rounded-xl overflow-hidden border border-[#1C1917]/12 min-h-[380px] sm:min-h-[440px] select-none touch-none cursor-grab active:cursor-grabbing ${
                lightMode === 'warm'
                  ? 'bg-gradient-to-b from-[#EDE5D7] via-[#E3D9C7] to-[#D4C6B1]'
                  : lightMode === 'day'
                  ? 'bg-gradient-to-b from-[#EDF2F7] via-[#E2EAF2] to-[#CFDCE8]'
                  : 'bg-[#1F1814]'
              }`}
            >
              <div ref={mountRef} className="w-full h-full" />
            </div>

            {/* Kontrol Zoom & Skala Motif */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[12px] text-[#575049]">
                    <span>Perbesar Kamera</span>
                    <span className="tabular-nums font-medium text-[#1C1917]">
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
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
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[12px] text-[#575049]">
                    <span>Skala Kerapatan Motif</span>
                    <span className="tabular-nums font-medium text-[#1C1917]">
                      {textureScale.toFixed(2)}×
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-[#575049] shrink-0">Besar</span>
                    <input
                      type="range"
                      min="0.55"
                      max="2.4"
                      step="0.05"
                      value={textureScale}
                      onChange={(e) => setTextureScale(parseFloat(e.target.value))}
                      className="w-full accent-[#7C3219] cursor-pointer"
                      aria-label="Skala Kerapatan Motif 3D"
                    />
                    <span className="text-[11px] text-[#575049] shrink-0">Rapat</span>
                  </div>
                </div>
              </div>

              <p className="text-[13px] text-[#575049] text-center">
                Seret untuk memutar 360° · Cubit atau gulir untuk zoom · Geser skala untuk ukuran motif
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
                    const hasDedicatedMockup = Boolean(resolveProductMockupUrl(prod));
                    const thumbUrl = resolveProductMockupUrl(prod) || resolveProductDisplayUrl(prod);
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
                        <div className="relative shrink-0">
                          <ProductArtwork
                            product={prod}
                            imageUrl={thumbUrl}
                            size={72}
                            className="w-10 h-10 rounded-sm border border-[#1C1917]/12"
                          />
                          {hasDedicatedMockup && (
                            <span
                              title="Memiliki tekstur mockup 3D khusus"
                              className="absolute -bottom-1 -right-1 px-1 py-px rounded bg-[#7C3219] text-white text-[9px] font-semibold leading-tight"
                            >
                              3D
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span
                            className={`block text-[13px] font-medium truncate ${
                              isSelected ? 'text-[#7C3219]' : 'text-[#1C1917]'
                            }`}
                          >
                            {prod.name}
                          </span>
                          <span className="block text-[12px] text-[#575049] truncate">
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
                    <span>Lihat Detail</span>
                    <ArrowRight className="w-3.5 h-3.5 m-arrow" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2.5 border-y border-[#1C1917]/12">
                  <span className="text-[13px] text-[#575049]">Harga resmi produk</span>
                  <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums">
                    {formatRupiah(activeProduct.price)}
                  </span>
                </div>

                {activeProduct.formattedAttributes.length > 0 && (
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
                )}
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-[#1C1917]/12">
              {waHref ? (
                <>
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
                </>
              ) : (
                <div className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#EFEAE0] text-[#575049] text-[13px] font-medium flex items-center justify-center">
                  Nomor WhatsApp sanggar belum tersedia
                </div>
              )}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}