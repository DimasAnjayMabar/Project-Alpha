import React, { useState, useEffect, useRef, memo } from 'react';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';

function ProductArtwork({ product, imageUrl, size = 320, className = '' }) {
  const canvasRef = useRef(null);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    if (canvasRef.current && product) {
      drawProductMotifToCanvas(canvasRef.current, product, size);
    }
  }, [product, size]);

  const showImg = Boolean(imageUrl) && failedUrl !== imageUrl;
  const isLoaded = showImg && loadedUrl === imageUrl;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full object-cover block" />
      {showImg && (
        <img
          src={imageUrl}
          alt={product?.name || 'Produk Batik'}
          onLoad={() => setLoadedUrl(imageUrl)}
          onError={() => setFailedUrl(imageUrl)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

export default memo(ProductArtwork);
