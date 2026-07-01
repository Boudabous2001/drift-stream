/**
 * AIMetadataPanel.tsx — Panneau IA Streamix (Pôle 3)
 * --------------------------------------------------
 * Se déclenche automatiquement quand une URL vidéo MP4 est chargée :
 * transcription (Whisper) + résumé/mots-clés/chapitres (Gemini). Les chapitres
 * sont cliquables (seek) et injectés comme annotations sur la timeline.
 */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { analyzeVideoUrl, chaptersToAnnotations } from '../lib/aiService';
import type { AIMetadata } from '../lib/aiService';
import type { Annotation } from '../lib/types';
import './ai-panel.css';

interface Props {
  videoUrl: string | null;
  onSeek: (time: number) => void;
  onChaptersReady?: (annotations: Annotation[]) => void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function AIMetadataPanel({ videoUrl, onSeek, onChaptersReady }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [metadata, setMetadata] = useState<AIMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No URL, or an HLS stream we can't analyse from the browser: stay idle.
    if (!videoUrl || videoUrl.endsWith('.m3u8')) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setMetadata(null);
    setError(null);

    analyzeVideoUrl(videoUrl)
      .then((data) => {
        if (cancelled) return;
        setMetadata(data);
        setStatus('done');
        if (onChaptersReady && data.chapters?.length) {
          onChaptersReady(chaptersToAnnotations(data.chapters));
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  if (!videoUrl || status === 'idle') return null;

  return (
    <aside className="ai-panel">
      <h3 className="ai-panel__title">
        <Sparkles size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        IA Streamix
      </h3>

      {status === 'loading' && (
        <div className="ai-panel__loading">
          <span className="spinner" />
          Transcription Whisper en cours…
        </div>
      )}

      {status === 'error' && (
        <div className="ai-panel__error">
          Erreur : {error}
          <br />
          <small>Vérifier que le Pôle 3 (port 8000) est démarré.</small>
        </div>
      )}

      {status === 'done' && metadata && (
        <>
          <div className="ai-panel__badge">
            Langue détectée : <strong>{metadata.language?.toUpperCase()}</strong>
          </div>

          <section className="ai-panel__section">
            <h4>Résumé</h4>
            <p>{metadata.summary}</p>
          </section>

          <section className="ai-panel__section">
            <h4>Mots-clés</h4>
            <div className="ai-panel__keywords">
              {metadata.keywords?.map((kw) => (
                <span key={kw} className="ai-panel__keyword">
                  {kw}
                </span>
              ))}
            </div>
          </section>

          <section className="ai-panel__section">
            <h4>Chapitres</h4>
            <ul className="ai-panel__chapters">
              {metadata.chapters?.map((ch, i) => (
                <li
                  key={i}
                  className="ai-panel__chapter"
                  onClick={() => onSeek(ch.start_time)}
                  title={`Aller à ${fmt(ch.start_time)}`}
                >
                  <span className="ai-panel__chapter-time">{fmt(ch.start_time)}</span>
                  <span className="ai-panel__chapter-title">{ch.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${sec}`;
}
