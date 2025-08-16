import { useRef, useEffect } from 'react';
import type { Layer } from '../types';

/**
 * Custom hook for managing audio elements and playback
 * Extracted from App.tsx for better organization
 */
export function useAudio(
  layers: Layer[],
  volumes: Record<string, number>,
  mutes: Record<string, boolean>,
  mixScale: number
) {
  const layerAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Update audio volumes when state changes
  useEffect(() => {
    layers.forEach(L => {
      const a = layerAudioRefs.current[L.id];
      if (a) {
        a.volume = volumes[L.id] ?? L.gain;
        a.muted = !!mutes[L.id];
      }
    });
  }, [layers, volumes, mutes, mixScale]);

  return {
    layerAudioRefs,
  };
}
