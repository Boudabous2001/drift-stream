/**
 * aiService.ts — Intégration Pôle 1 <-> Pôle 3 (Streamix)
 * -------------------------------------------------------
 * Client HTTP vers le pipeline FastAPI Whisper+Gemini (Pôle 3, port 8000).
 * Utilise l'endpoint `/analyze-url` qui accepte une URL vidéo (pas d'upload
 * fichier depuis le navigateur) et renvoie transcription / résumé / chapitres.
 */
import type { Annotation } from './types';

const AI_URL = (import.meta as any).env?.VITE_AI_API_URL ?? 'http://localhost:8000';

export interface AIChapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface AIMetadata {
  transcript: string;
  summary: string;
  keywords: string[];
  chapters: AIChapter[];
  language: string;
  segments?: { start: number; end: number; text: string }[];
}

/** Déclenche l'analyse IA d'une vidéo depuis son URL (MP4 de préférence). */
export async function analyzeVideoUrl(videoUrl: string): Promise<AIMetadata> {
  const res = await fetch(`${AI_URL}/analyze-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_url: videoUrl }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`[IA Streamix] /analyze-url => ${res.status} : ${err}`);
  }

  return (await res.json()) as AIMetadata;
}

/**
 * Convertit les chapitres IA en annotations Phantom Frame : chaque chapitre
 * devient un marqueur texte épinglé au bon instant de la timeline. Le format
 * est strictement celui du type `Annotation` (donc exportable en JSON).
 */
export function chaptersToAnnotations(chapters: AIChapter[]): Annotation[] {
  return chapters.map((ch, i) => ({
    id: `ai_chapter_${i}_${Math.round(ch.start_time)}`,
    tool: 'text',
    time: ch.start_time,
    color: '#a855f7',
    strokeWidth: 2,
    x1: 0.02,
    y1: 0.05,
    text: `[IA] ${ch.title}`,
    authorName: 'Streamix IA',
  }));
}
