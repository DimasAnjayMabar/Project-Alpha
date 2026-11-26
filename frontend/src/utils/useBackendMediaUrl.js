// frontend/src/utils/useBackendMediaUrl.js
import { useState, useEffect } from 'react';
import {
  resolveBackendMediaUrl,
  fetchBackendMediaBlobUrl,
} from './url_controller';

const mediaUrlCache = new Map();
const inflightMediaRequests = new Map();

function getImmediateMediaUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
  const normalizedUrl = resolveBackendMediaUrl(trimmed);
  if (!normalizedUrl) return '';
  return mediaUrlCache.get(normalizedUrl) || '';
}

export function useBackendMediaUrl(rawUrl) {
  const [mediaState, setMediaState] = useState(() => ({
    rawUrl,
    url: getImmediateMediaUrl(rawUrl),
    failed: false,
  }));

  useEffect(() => {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return undefined;
    }

    const normalizedUrl = resolveBackendMediaUrl(trimmed);
    if (!normalizedUrl || mediaUrlCache.has(normalizedUrl)) {
      return undefined;
    }

    let cancelled = false;
    let request = inflightMediaRequests.get(normalizedUrl);
    if (!request) {
      request = fetchBackendMediaBlobUrl(normalizedUrl)
        .then((media) => {
          mediaUrlCache.set(normalizedUrl, media.url);
          inflightMediaRequests.delete(normalizedUrl);
          return media.url;
        })
        .catch((err) => {
          inflightMediaRequests.delete(normalizedUrl);
          throw err;
        });
      inflightMediaRequests.set(normalizedUrl, request);
    }

    request
      .then((url) => {
        if (!cancelled) {
          setMediaState({ rawUrl, url, failed: false });
        }
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setMediaState({ rawUrl, url: '', failed: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rawUrl]);

  const immediateUrl = getImmediateMediaUrl(rawUrl);
  const src = immediateUrl || (mediaState.rawUrl === rawUrl ? mediaState.url : '');
  const failed = !immediateUrl && mediaState.rawUrl === rawUrl && mediaState.failed;

  return { src, failed };
}
