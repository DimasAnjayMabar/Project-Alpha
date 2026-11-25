import React, { useState, useEffect, useRef, memo } from 'react';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';
import { useBackendMediaUrl } from '../../utils/useBackendMediaUrl';

function ProductArtwork({ product, imageUrl, size = 320, className = '' }) {
  const canvasRef = useRef(null);
  const { src: resolvedSrc, failed } = useBackendMediaUrl(imageUrl);
  const [loadedSrc, setLoadedSrc] = useState('');
  const [imgErrorSrc, setImgErrorSrc] = useState('');

  useEffect(() => {
    if (canvasRef.current && product) {
      drawProductMotifToCanvas(canvasRef.current, product, size);
    }
  }, [product, size]);

  const showImg = Boolean(resolvedSrc) && !failed && imgErrorSrc !== resolvedSrc;
  const isLoaded = showImg && loadedSrc === resolvedSrc;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full object-cover block" />
      {showImg && (
        <img
          src={resolvedSrc}
          alt={product?.name || 'Produk Batik'}
          onLoad={() => setLoadedSrc(resolvedSrc)}
          onError={() => setImgErrorSrc(resolvedSrc)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

export default memo(ProductArtwork);