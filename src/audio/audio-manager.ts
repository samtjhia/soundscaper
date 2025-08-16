import type { Layer } from "../types";

/**
 * Audio utility functions for managing layer playback
 * Extracted from App.tsx for better organization
 */

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function effectiveGain(
  layerId: string, 
  baseGain: number, 
  volumes: Record<string, number>, 
  mixScale: number
): number {
  const rel = volumes[layerId] ?? baseGain;
  return clamp01(rel * mixScale);
}

// Alternative signature that matches App.tsx usage
export function createEffectiveGainFn(volumes: Record<string, number>, mixScale: number) {
  return (id: string, base: number) => {
    const rel = volumes[id] ?? base;
    return clamp01(rel * mixScale);
  };
}

export function hasUsablePreview(item?: any): boolean {
  if (!item?.previews) return false;
  return Boolean(
    item.previews["preview-lq-mp3"] ||
    item.previews["preview-hq-mp3"] ||
    item.previews["preview-hq-ogg"] ||
    item.previews["preview-lq-ogg"]
  );
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export function applyGlobalScale(
  layers: Layer[],
  newScale: number,
  audioRefs: Record<string, HTMLAudioElement | null>,
  volumes: Record<string, number>
): void {
  layers.forEach(L => {
    const a = audioRefs[L.id];
    if (a) {
      a.volume = effectiveGain(L.id, L.gain, volumes, newScale);
    }
  });
}

export function playAllLayers(
  layers: Layer[],
  audioRefs: Record<string, HTMLAudioElement | null>,
  mutes: Record<string, boolean>
): void {
  layers.forEach(L => {
    const a = audioRefs[L.id];
    if (a && !mutes[L.id]) {
      a.currentTime = 0;
      a.play().catch(e => {
        console.warn(`[playAll] failed for ${L.id}:`, e);
      });
    }
  });
}

export function stopAllLayers(
  layers: Layer[],
  audioRefs: Record<string, HTMLAudioElement | null>
): void {
  layers.forEach(L => {
    const a = audioRefs[L.id];
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
  });
}

export function fadeToVolume(
  audioElement: HTMLAudioElement,
  targetVolume: number,
  durationMs: number = 2000
): void {
  const startVolume = audioElement.volume;
  const startTime = Date.now();

  function updateVolume() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    audioElement.volume = startVolume + (targetVolume - startVolume) * progress;
    
    if (progress < 1) {
      requestAnimationFrame(updateVolume);
    }
  }
  
  updateVolume();
}
