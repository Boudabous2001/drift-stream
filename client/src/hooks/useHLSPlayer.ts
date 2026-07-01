/**
 * useHLSPlayer.ts — Intégration Pôle 1 <-> Pôle 2 (Streamix)
 * ----------------------------------------------------------
 * Branche la ref vidéo de ReviewPlayer sur le flux HLS chiffré AES-128 servi
 * par Nginx (Pôle 2, port 8001). hls.js intercepte la requête de clé AES et
 * ajoute le token pour que le Key Server (port 8085) délivre `enc.key`.
 *
 * Pour une source MP4 directe, le hook ne fait rien de spécial (la balise
 * <video src> gère la lecture) — comportement identique à l'original.
 */
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

const HLS_BASE = (import.meta as any).env?.VITE_HLS_BASE_URL ?? 'http://localhost:8001';
const KEY_SERVER = (import.meta as any).env?.VITE_KEY_SERVER_URL ?? 'http://localhost:8085';
const HLS_TOKEN = (import.meta as any).env?.VITE_HLS_TOKEN ?? 'token_cyber_2026';

export function isHlsSource(src: string | null | undefined): boolean {
  return Boolean(src && src.endsWith('.m3u8'));
}

export function useHLSPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  src: string | null | undefined,
) {
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // MP4 (or any non-HLS source): let the native <video src> handle it.
    if (!isHlsSource(src)) return;

    const hlsUrl = src.startsWith('http') ? src : `${HLS_BASE}${src}`;

    // Safari plays HLS natively.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      return;
    }

    if (!Hls.isSupported()) {
      // eslint-disable-next-line no-console
      console.error('[Streamix] hls.js non supporté sur ce navigateur');
      return;
    }

    const hls = new Hls({
      xhrSetup(xhr: XMLHttpRequest, url: string) {
        // Inject the ephemeral-key token for the Key Server requests.
        if ((url.includes(KEY_SERVER) || url.includes('/key')) && !url.includes('token=')) {
          const sep = url.includes('?') ? '&' : '?';
          xhr.open('GET', `${url}${sep}token=${HLS_TOKEN}`, true);
        }
      },
      startLevel: -1,
      enableWorker: true,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, (_e: unknown, data: any) => {
      if (data.fatal) {
        // eslint-disable-next-line no-console
        console.error('[Streamix HLS] Erreur fatale :', data.type, data.details);
        hls.destroy();
      }
    });

    hlsRef.current = hls;
    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [videoRef, src]);

  return hlsRef;
}
