import React, { useState, useEffect, useRef, memo } from 'react';
import { drawProductMotifToCanvas } from '../utils/batikCanvas';

function ProductArtwork({ product, imageUrl, size = 320, className = '' }) {
  const canvasRef = useRef(null);
  const [imgStatus, setImgStatus] = useState('loading');

  useEffect(() => {
    setImgStatus(imageUrl ? 'loading' : 'fallback');
  }, [imageUrl]);

  useEffect(() => {
    if (canvasRef.current && product) {
      drawProductMotifToCanvas(canvasRef.current, product, size);
    }
  }, [product, size]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full object-cover block" />
      {imageUrl && imgStatus !== 'fallback' && (
        <img
          src={imageUrl}
          alt={product?.name || 'Produk Batik'}
          onLoad={() => setImgStatus('loaded')}
          onError={() => setImgStatus('fallback')}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            imgStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

export default memo(ProductArtwork);