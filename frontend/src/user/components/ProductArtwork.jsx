import React, { useState, useEffect, useRef, memo } from 'react';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';
import { useBackendMediaUrl } from '../../utils/useBackendMediaUrl';

const decodedImageUrls = new Set();

function ProductArtwork({ product, imageUrl, size = 320, className = '' }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const { src: resolvedSrc, failed } = useBackendMediaUrl(imageUrl);
  const [loadedSrc, setLoadedSrc] = useState('');
  const [imgErrorSrc, setImgErrorSrc] = useState('');

  const showImg = Boolean(resolvedSrc) && !failed && imgErrorSrc !== resolvedSrc;
  const alreadyDecoded = Boolean(resolvedSrc) && decodedImageUrls.has(resolvedSrc);
  const isLoaded = showImg && (alreadyDecoded || loadedSrc === resolvedSrc);

  useEffect(() => {
    if (isLoaded || !canvasRef.current || !product) return;
    drawProductMotifToCanvas(canvasRef.current, product, Math.min(size, 220));
  }, [isLoaded, product, size]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !resolvedSrc || decodedImageUrls.has(resolvedSrc)) return undefined;
    if (el.complete && el.naturalWidth > 0) {
      decodedImageUrls.add(resolvedSrc);
      const raf = requestAnimationFrame(() => setLoadedSrc(resolvedSrc));
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [resolvedSrc]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!isLoaded && <canvas ref={canvasRef} className="w-full h-full object-cover block" />}
      {showImg && (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={product?.name || 'Produk Batik'}
          decoding="async"
          onLoad={() => {
            if (resolvedSrc) decodedImageUrls.add(resolvedSrc);
            setLoadedSrc(resolvedSrc);
          }}
          onError={() => setImgErrorSrc(resolvedSrc)}
          className={`absolute inset-0 w-full h-full object-cover ${
            alreadyDecoded ? '' : 'transition-opacity duration-300'
          } ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}

export default memo(ProductArtwork);
