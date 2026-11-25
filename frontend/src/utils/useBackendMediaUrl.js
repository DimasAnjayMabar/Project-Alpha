// frontend/src/utils/useBackendMediaUrl.js
import { useState, useEffect } from 'react';
import {
  resolveBackendMediaUrl,
  fetchBackendMediaBlobUrl,
} from './url_controller';

export function useBackendMediaUrl(rawUrl) {
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      setResolvedUrl('');
      setFailed(false);
      return undefined;
    }

    // URL pratinjau lokal (URL.createObjectURL / base64) langsung dipakai tanpa fetch
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      setResolvedUrl(trimmed);
      setFailed(false);
      return undefined;
    }

    const normalizedUrl = resolveBackendMediaUrl(trimmed);
    if (!normalizedUrl) {
      setResolvedUrl('');
      setFailed(false);
      return undefined;
    }

    let cancelled = false;
    let revokeBlob = null;
    const abortController = new AbortController();

    setResolvedUrl('');
    setFailed(false);

    fetchBackendMediaBlobUrl(normalizedUrl, { signal: abortController.signal })
      .then((media) => {
        if (cancelled) {
          media.revoke?.();
          return;
        }
        revokeBlob = media.revoke;
        setResolvedUrl(media.url);
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (revokeBlob) {
        revokeBlob();
      }
    };
  }, [rawUrl]);

  return { src: resolvedUrl, failed };
}