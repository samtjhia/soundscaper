import { useState, useRef } from 'react';
import type { FSItem, Layer } from '../types';

/**
 * Custom hook for managing layers state
 * Extracted from App.tsx for better organization
 */
export function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [mutes, setMutes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  // Refs for managing alternates and swapping state
  const alternatesRef = useRef<Record<string, FSItem[]>>({});
  const altIndexRef = useRef<Record<string, number>>({});
  const swappingRef = useRef<Set<string>>(new Set());

  const resetLayers = () => {
    setLayers([]);
    setVolumes({});
    setMutes({});
    setIsLoading({});
    alternatesRef.current = {};
    altIndexRef.current = {};
    swappingRef.current = new Set();
  };

  return {
    // State
    layers,
    volumes,
    mutes,
    isLoading,
    
    // Setters
    setLayers,
    setVolumes,
    setMutes,
    setIsLoading,
    
    // Refs
    alternatesRef,
    altIndexRef,
    swappingRef,
    
    // Actions
    resetLayers,
  };
}
