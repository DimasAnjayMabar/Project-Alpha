import React, { useEffect, useRef, useState } from 'react';

const observerCallbacks = new WeakMap();
let sharedObserver = null;

function getSharedObserver() {
  if (sharedObserver || typeof IntersectionObserver === 'undefined') {
    return sharedObserver;
  }
  sharedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight * 0.92) {
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb();
            observerCallbacks.delete(entry.target);
          }
          sharedObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: '0px 0px -10% 0px' }
  );
  return sharedObserver;
}

export default function FadeIn({
  children,
  className = '',
  as: Tag = 'div',
  delay = 0,
  variant = 'up',
  id,
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (visible) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const observer = getSharedObserver();
    if (!observer) {
      setVisible(true);
      return undefined;
    }

    observerCallbacks.set(el, () => setVisible(true));
    observer.observe(el);

    return () => {
      observerCallbacks.delete(el);
      observer.unobserve(el);
    };
  }, [visible]);

  const variantClass = variant === 'scale' ? 'fade-section--scale' : '';

  return (
    <Tag
      ref={ref}
      id={id}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`fade-section ${variantClass} ${visible ? 'is-visible' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
