import React, { useEffect, useState } from 'react';
import { searchOnce, getById } from "./freesound/client";
import { AUTO_RUN_ON_LOAD, SEARCH_DEFAULT_QUERY, CACHE_TTL_MS, FETCH_VERSION } from "./config";
import type { FSItem, Layer } from "./types";
import { gainForTag } from "./ai/rules";
import { aiService } from "./ai/ai-service";
import { getCache, setCache, clearOldCache, clearOldVersions, clearAllCache } from "./cache/idb";

// Helper to get cached audio as Blob URL
async function getCachedAudioUrl(layer: Layer): Promise<string | null> {
  if (!layer.item) return null;
  const key = `${FETCH_VERSION}:audio|${layer.item.id}`;
  const cached = await getCache<ArrayBuffer>(key);
  if (cached?.data) {
    const blob = new Blob([cached.data], { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }
  return null;
}
import { allWhitelist, pickWhitelist, WL_CACHE_PREFIX } from "./freesound/whitelist";
import { useLayers } from './hooks/use-layers';
import { useAudio } from './hooks/use-audio';
import { TransportControls } from './components/transport-controls';
import { LayerList } from './components/layer-list';
import { AddLayer } from './components/add-layer';
import { 
  clamp01, 
  hasUsablePreview, 
  withTimeout
} from './audio/audio-manager';



export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Layer management with custom hook
  const {
    layers, volumes, mutes, isLoading,
    setLayers, setVolumes, setMutes, setIsLoading,
    alternatesRef, altIndexRef, swappingRef
  } = useLayers();

  const [mixScale, setMixScale] = React.useState(1);
  const [rulesScale, setRulesScale] = React.useState(1);
  const [swapping, setSwapping] = React.useState<Record<string, boolean>>({});
  const [fullscreenImage, setFullscreenImage] = React.useState<boolean>(false);

  // Audio management with custom hook
  const { layerAudioRefs } = useAudio(layers, volumes, mutes, mixScale);

  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    source: 'llm' | 'rules' | 'fallback';
    confidence: number;
    reasoning?: string;
  } | null>(null);

  // Image generation state
  const [generatedImage, setGeneratedImage] = useState<{
    url: string;
    prompt: string;
    revisedPrompt?: string;
  } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Message system for user-facing feedback
  const [messages, setMessages] = useState<Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
    timestamp: number;
  }>>([]);

  const addMessage = (type: 'info' | 'success' | 'warning' | 'error', text: string) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [
      ...prev.slice(-9), // Keep only last 10 messages
      { id, type, text, timestamp: Date.now() }
    ]);
    
    // Auto-remove success and info messages after 10 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== id));
      }, 10000);
    }
  };



  async function handleClearCache() {
    try {
      setClearing(true);
      await clearAllCache();
      addMessage('success', 'Cache cleared successfully');
      setCacheStatus(null);
    } finally {
      setClearing(false);
    }
  }

  const [prompt, setPrompt] = React.useState<string>("");

  function effectiveGain(id: string, base: number) {
    const rel = volumes[id] ?? base;
    return clamp01(rel * mixScale);
  }

  function selectPreviewUrl(item?: FSItem | null): string | null {
    if (!item?.previews) return null;
    return (
      item.previews["preview-lq-mp3"] ||
      item.previews["preview-hq-mp3"] ||
      item.previews["preview-hq-ogg"] ||
      item.previews["preview-lq-ogg"] ||
      null
    );
  }

  function beginSceneRebuild() {
    for (const id of Object.keys(layerAudioRefs.current)) {
      const a = layerAudioRefs.current[id];
      if (!a) continue;
      try { a.pause(); a.currentTime = 0; } catch (e) {
        addMessage('warning', `Failed to stop audio layer: ${id}`);
      }
    }

    setIsLoading({});
    setMutes({});
    setVolumes({});
    setLayers([]);
  }

  async function seedWhitelistCache(maxPerTag = 2) {
    const wl = allWhitelist(); // { tag: number[] }
    addMessage('info', 'Seeding whitelist cache...');
    for (const [tag, ids] of Object.entries(wl)) {
      const pick = ids.slice(0, maxPerTag);
      for (const id of pick) {
        const key = `${FETCH_VERSION}:${WL_CACHE_PREFIX}${id}`;
        try {
          const hit = await getCache<any>(key);
          if (hit?.data) {
            continue;
          }
          const item = await getById(id);
          await setCache(key, item);
        } catch (e) {
          addMessage('warning', `Failed to cache ${tag} (ID: ${id})`);
        }
      }
    }
    addMessage('success', 'Whitelist cache seeding complete');
  }


  async function runSearch(promptOverride?: string) {
    setLoading(true);
    setError(null);
    setAiAnalysis(null);
    
    // Clear old messages and image when starting a new search
    setMessages([]);
    setGeneratedImage(null);
    setImageLoading(false);

    beginSceneRebuild();

    const p = (promptOverride ?? prompt ?? "").trim();

    try {
      // Use AI service instead of hardcoded rules
      addMessage('info', 'Analyzing prompt with AI...');
      const aiResult = await aiService.analyzePrompt(p);
      
      setAiAnalysis({
        source: aiResult.source,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning
      });

      const { tags, gainScale, baseGainsMap } = aiResult;
      setRulesScale(gainScale);
      setMixScale(gainScale);

      addMessage('success', `AI analysis complete using ${aiResult.source.toUpperCase()}`);

      // Use prompt-only cache key to ensure consistent hits for same user input
      const cacheKey = `${FETCH_VERSION}:prompt|${p.toLowerCase()}`;

      clearOldCache(CACHE_TTL_MS).catch(() => { });
      await clearOldVersions(FETCH_VERSION + ":");

      const cached = await getCache<{ byTag: Record<string, any> }>(cacheKey);
      let byTag: Record<string, any> | null = null;
      const isFresh = cached ? (Date.now() - cached.timestamp) <= CACHE_TTL_MS : false;

      if (cached && isFresh && cached.data?.byTag) {
        byTag = cached.data.byTag;
        addMessage('info', `Using cached results for "${p}"`);
        setCacheStatus("HIT");
      } else {
        if (cached && !isFresh) {
          addMessage('info', 'Cache is stale, fetching fresh results...');
          setCacheStatus("STALE");
        } else {
          addMessage('info', 'No cache found, searching for sounds...');
          setCacheStatus("MISS");
        }

        const entries = await Promise.all(
          tags.map(async (tag) => {
            let data: any = null;
            if (!DEV_FORCE_FALLBACK) {
              try {
                data = await withTimeout(searchOnce(tag), 10_000);
              } catch (err) {
                addMessage('warning', `Search failed for "${tag}"`);
              }
            }

            if (!data || !(Array.isArray(data.results) && data.results.length > 0)) {
              const wid = pickWhitelist(tag);
              if (wid != null) {
                const wlKey = `${FETCH_VERSION}:${WL_CACHE_PREFIX}${wid}`;

                try {
                  const cachedWl = await getCache<any>(wlKey);
                  if (cachedWl?.data) {
                    data = { results: [cachedWl.data] };
                  } else {
                    const item = await getById(wid);
                    await setCache(wlKey, item);
                    data = { results: [item] };
                  }
                } catch (e) {
                  addMessage('warning', `Failed to fetch fallback audio for "${tag}"`);
                  data = null;
                }
              } else {
                addMessage('warning', `No fallback audio available for "${tag}"`);
              }
            }

            return [tag, data] as const;
          })
        );

        byTag = Object.fromEntries(entries);

        await setCache(cacheKey, { byTag });
        addMessage('success', `Results cached for "${p}"`);
      }

      const results = await Promise.all(
        tags.map(async (tag) => {
          const data = byTag?.[tag];
          const rawResults = data?.results ?? [];
          
          // Map all results first (don't filter by preview yet)
          const allCandidates: FSItem[] = rawResults
            .map((r: any) => ({
              id: r.id,
              name: r.name,
              duration: r.duration,
              license: r.license,
              username: r.username,
              tags: r.tags,
              previews: r.previews,
              rating: r.rating || 0,
              num_downloads: r.num_downloads || 0,
            }));

          if (allCandidates.length === 0) {
            addMessage('warning', `No search results found for "${tag}"`);
            return null;
          }

          // Score ALL candidates first
          console.log(`[${tag}] Scoring ${allCandidates.length} candidates...`);
          
          const scoredCandidates = allCandidates.map((candidate: any) => {
            let score = 0;
            
            // Rating score (0-5 stars, normalize to 0-1)
            score += (candidate.rating || 0) / 5 * 0.4;
            
            // Downloads score (logarithmic, popular sounds are better)
            const downloads = candidate.num_downloads || 1;
            score += Math.min(Math.log10(downloads) / 4, 1) * 0.3; // Cap at 10k downloads = max score
            
            // Duration score (prefer 30-120 seconds for loops)
            const duration = candidate.duration || 60;
            if (duration >= 30 && duration <= 120) {
              score += 0.2;
            } else if (duration >= 15 && duration <= 240) {
              score += 0.1;
            }
            
            // Title quality score (avoid obvious music indicators)
            const title = (candidate.name || '').toLowerCase();
            if (title.includes('loop') || title.includes('ambient')) {
              score += 0.1;
            }
            if (title.includes('music') || title.includes('song') || title.includes('track')) {
              score -= 0.3;
            }
            if (title.includes('melody') || title.includes('beat') || title.includes('chord')) {
              score -= 0.2;
            }
            
            return { candidate, score };
          });

          // Sort by score (best first)
          scoredCandidates.sort((a: any, b: any) => b.score - a.score);
          
          // Find the best candidate that has a usable preview
          let bestItem: FSItem | null = null;
          
          for (let i = 0; i < scoredCandidates.length; i++) {
            const { candidate } = scoredCandidates[i];
            if (hasUsablePreview(candidate)) {
              bestItem = candidate;
              break;
            }
          }

          if (!bestItem) {
            addMessage('warning', `No playable audio found for "${tag}"`);
            return null;
          }

          // Try LLM scoring if available (as additional validation)
          if (aiService.isLLMEnabled() && allCandidates.length > 2) {
            try {
              const candidatesForLLM = allCandidates.slice(0, 5).map((c: any) => ({
                id: c.id,
                name: c.name || 'Untitled',
                tags: c.tags || [],
                username: c.username || 'Unknown'
              }));
              
              const llmScores = await aiService.scoreAudioOptions(p, candidatesForLLM);
              const llmBest = llmScores.reduce((best, current) => 
                current.relevanceScore > best.relevanceScore ? current : best
              );
              const llmChoice = allCandidates.find((c: any) => String(c.id) === llmBest.audioId);
              
              // Only use LLM choice if it has a usable preview AND high relevance
              if (llmChoice && hasUsablePreview(llmChoice) && llmBest.relevanceScore > 0.7) {
                bestItem = llmChoice;
              }
            } catch (error) {
              // LLM scoring failed, continue with rule-based selection
            }
          }

          // Store alternates for swapping (only those with usable previews)
          alternatesRef.current[tag] = allCandidates.filter((r: any) => r.id !== bestItem?.id && hasUsablePreview(r));
          altIndexRef.current[tag] = 0;

          const base = baseGainsMap[tag] ?? gainForTag(tag);
          const layer: Layer = {
            id: tag,
            tag,
            item: bestItem,
            gain: base,
            link: `https://freesound.org/s/${bestItem.id}/`,
          };

          return layer;
        })
      );

      let usable = results.filter((x): x is Layer => !!x);
      
      // FALLBACK SYSTEM: If we don't have enough sounds, try to get more
      const targetSounds = Math.max(3, Math.ceil(tags.length * 0.8)); // Aim for 80% success rate, minimum 3
      const maxFallbackAttempts = 2;
      let fallbackAttempts = 0;
      
      console.log(`[FALLBACK] Target: ${targetSounds} sounds, Current: ${usable.length}, Missing: ${tags.length - usable.length}`);
      
      while (usable.length < targetSounds && fallbackAttempts < maxFallbackAttempts) {
        fallbackAttempts++;
        addMessage('info', `Searching for additional sounds (${usable.length}/${targetSounds} found)...`);
        
        try {
          // Get fallback tags from LLM
          const failedTags = tags.filter(tag => !usable.some(layer => layer.tag === tag));
          
          if (aiService.isLLMEnabled()) {
            const fallbackPrompt = `The original tags [${failedTags.join(', ')}] failed to find audio for "${p}". Suggest ${targetSounds - usable.length} alternative single-word tags that would create similar atmosphere but are more likely to have audio samples available. Return only the tags, comma-separated.`;
            
            // Use LLM service directly instead of fetch
            const fallbackTags = await aiService.generateFallbackTags(fallbackPrompt, targetSounds - usable.length);
            
            // Try fallback tags
            const fallbackResults = await Promise.all(
              fallbackTags.map(async (tag: string) => {
                try {
                  const data = await withTimeout(searchOnce(tag), 8_000);
                  if (data?.results?.length > 0) {
                    const candidates = data.results
                      .map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        duration: r.duration,
                        license: r.license,
                        username: r.username,
                        tags: r.tags,
                        previews: r.previews,
                        rating: r.rating || 0,
                        num_downloads: r.num_downloads || 0,
                      }))
                      .filter(hasUsablePreview);
                      
                    if (candidates.length > 0) {
                      const bestItem = candidates[0]; // Just take first usable one for speed
                      
                      const base = gainForTag(tag);
                      const layer: Layer = {
                        id: `fallback-${tag}`,
                        tag,
                        item: bestItem,
                        gain: base,
                        link: `https://freesound.org/s/${bestItem.id}/`,
                      };
                      return layer;
                    }
                  }
                } catch (err) {
                  console.warn(`[FALLBACK] Failed to search for "${tag}":`, err);
                }
                return null;
              })
            );
            
            const newLayers = fallbackResults.filter((x: any): x is Layer => !!x);
            usable = [...usable, ...newLayers];
            
            if (newLayers.length === 0) {
              addMessage('warning', 'No additional sounds found');
              break;
            } else {
              addMessage('success', `Found ${newLayers.length} additional sounds`);
            }
          } else {
            break;
          }
        } catch (fallbackErr) {
          addMessage('error', 'Fallback search failed');
        }
      }
      
      setLayers(usable);
      addMessage('success', `Soundscape complete: ${usable.length} layers loaded`);

      // Generate image if we have a successful soundscape and LLM is available
      if (usable.length > 0 && aiService.isLLMEnabled()) {
        generateImage(p);
      }

    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      addMessage('error', 'Failed to generate soundscape');
    } finally {
      setLoading(false);
    }
  }

  async function generateImage(prompt: string) {
    if (!aiService.isLLMEnabled()) {
      addMessage('warning', 'Image generation requires OpenAI API key in environment variables');
      return;
    }

    setImageLoading(true);
    addMessage('info', 'Generating visual representation...');

    try {
      const result = await aiService.generateImage(prompt);
      setGeneratedImage({
        url: result.url,
        prompt: prompt,
        revisedPrompt: result.revisedPrompt
      });
      addMessage('success', 'Image generated successfully');
    } catch (error) {
      console.error('Image generation failed:', error);
      if (error instanceof Error && error.message.includes('API key')) {
        addMessage('error', 'Image generation failed: Invalid API key');
      } else {
        addMessage('error', 'Image generation failed - check console for details');
      }
    } finally {
      setImageLoading(false);
    }
  }

  function applyGlobalScale(newScale: number) {
    setMixScale(newScale);

    // Reset all volumes to their original values
    const originalVolumes: Record<string, number> = {};
    for (const layer of layers) {
      originalVolumes[layer.id] = layer.gain;
    }
    setVolumes(originalVolumes);

    // Update audio elements with original gains and new scale
    for (const id of Object.keys(layerAudioRefs.current)) {
      const a = layerAudioRefs.current[id];
      if (!a) continue;
      const L = layers.find(x => x.id === id);
      if (!L) continue;
      a.volume = clamp01(L.gain * newScale);
    }
  }

  function nudgeMix(factor: number) {
    const newScale = clamp01(mixScale * factor);
    setMixScale(newScale);

    // Check if any audio is currently playing
    const anyPlaying = layers.some(L => {
      const a = layerAudioRefs.current[L.id];
      return a && !a.paused;
    });

    // If audio is playing, restart it with new volumes
    if (anyPlaying) {
      // Stop all first
      for (const L of layers) {
        const a = layerAudioRefs.current[L.id];
        if (a && !a.paused) {
          a.pause();
          a.currentTime = 0;
        }
      }
      
      // Then restart with new settings
      setTimeout(() => {
        handlePlayAll();
      }, 50); // Small delay to ensure stop is processed
    }
  }



  useEffect(() => {
    if (!layers.length) return;
    setVolumes(prev => {
      const next = { ...prev };
      for (const L of layers) {
        if (next[L.id] == null) next[L.id] = L.gain;
      }
      return next;
    });
  }, [layers]);

  useEffect(() => {
    if (!layers.length) return;

    setMutes(prev => {
      const next = { ...prev };
      for (const L of layers) if (next[L.id] == null) next[L.id] = false;
      return next;
    });

    setIsLoading(prev => {
      const next = { ...prev };
      for (const L of layers) next[L.id] = true;
      return next;
    });
  }, [layers]);

  useEffect(() => {
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;
      a.volume = volumes[L.id] ?? L.gain;
      a.muted = !!mutes[L.id];
    }
  }, [layers, volumes, mutes]);

  useEffect(() => {
    layers.forEach(async (L) => {
      const a = layerAudioRefs.current[L.id];
      if (!a || !L.item) return;

      let src: string | null = null;
      src = await getCachedAudioUrl(L);
      if (!src) {
        const rawSrc = selectPreviewUrl(L.item);
        if (!rawSrc) {
          console.warn(`[init] No preview URL for layer ${L.id}`);
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
          return;
        }
        src = `${rawSrc}${rawSrc.includes("?") ? "&" : "?"}v=${L.item.id}`;
      }

      if (a.src !== src) {
        console.log(`[init] Setting audio source for ${L.id}: ${src}`);
        a.src = src;
        a.loop = true;
        a.volume = effectiveGain(L.id, L.gain);
        a.muted = !!mutes[L.id];
        try {
          a.load();
        } catch (e) {
          console.warn(`[init] Failed to load audio for ${L.id}`, e);
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
        }
      }
    });
  }, [layers, mutes, mixScale]);

  useEffect(() => {
    return () => {
      for (const L of layers) {
        const a = layerAudioRefs.current[L.id];
        if (!a) continue;
        try { a.pause(); } catch { }
        a.src = "";
        try { a.load(); } catch { }
      }
    };
  }, [layers]);

  // Handle escape key for fullscreen image
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenImage) {
        setFullscreenImage(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [fullscreenImage]);


  const handlePlayAll = () => {
    if (layers.length === 0) return;
    
    addMessage('info', 'Starting playback...');
    
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;

      if (!a.src) {
        continue;
      }

      a.volume = effectiveGain(L.id, L.gain);

      if (mutes && typeof mutes[L.id] === "boolean") {
        a.muted = !!mutes[L.id];
      }

      a.loop = true;
      a.currentTime = 0;

      a.play().catch(() => {
        if (a.readyState < 2) {
          const onReady = () => {
            a.currentTime = 0;
            a.play().catch(() => {
              // Silent fail on delayed play
            });
          };
          a.addEventListener('canplay', onReady, { once: true });
        }
      });
    }
  };


  const handleStopAll = () => {
    if (layers.length === 0) return;
    
    addMessage('info', 'Stopping playback...');
    
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;
      a.pause();
      a.currentTime = 0;
    }
  };

  const handleClearAll = () => {
    // Stop all audio first
    handleStopAll();
    
    // Clear all layer data
    setIsLoading({});
    setMutes({});
    setVolumes({});
    setLayers([]);
    
    // Reset scales to defaults
    setMixScale(1);
    setRulesScale(1);
    
    // Clear any error states
    setError(null);
  };

  // read once on mount
  const params = new URLSearchParams(window.location.search);
  const DEV_FORCE_FALLBACK = params.get("fallback") === "1";
  const DEV_MODE = params.get("dev") === "1";

  // for auto-run make URL have ?auto=1
  React.useEffect(() => {
    const autoFromUrl = params.get("auto") === "1";
    if (autoFromUrl || AUTO_RUN_ON_LOAD) {
      runSearch();
    }
  }, []);

  async function handleSwap(L: Layer) {
    const tag = L.tag;
    const currentPrompt = prompt || '';

    // Set swapping state and add message
    setSwapping(prev => ({ ...prev, [L.id]: true }));
    addMessage('info', `Searching for alternative audio for "${tag}"...`);

    console.log(`[swap] Finding intelligent alternative for tag "${tag}" in context: "${currentPrompt}"`);

    // Do a fresh search to get current candidates
    let data: any = null;
    if (!DEV_FORCE_FALLBACK) {
      try {
        data = await withTimeout(searchOnce(tag), 10_000);
      } catch (err) {
        console.warn(`[swap] search failed or timed out for ${tag}`, err);
      }
    }

    // Fallback to whitelist if search fails
    if (!data || !(Array.isArray(data.results) && data.results.length > 0)) {
      const wid = pickWhitelist(tag);
      if (wid != null) {
        const wlKey = `${FETCH_VERSION}:${WL_CACHE_PREFIX}${wid}`;
        try {
          const cached = await getCache<any>(wlKey);
          if (cached?.data) {
            data = { results: [cached.data] };
          } else {
            const item = await getById(wid);
            await setCache(wlKey, item);
            data = { results: [item] };
          }
        } catch (e) {
          console.warn(`[swap] whitelist fetch failed for ${tag} id=${wid}`, e);
          setSwapping(prev => ({ ...prev, [L.id]: false }));
          addMessage('warning', `Failed to find alternative for "${tag}"`);
          return;
        }
      } else {
        console.warn(`[swap] no search results and no whitelist for tag=${tag}`);
        setSwapping(prev => ({ ...prev, [L.id]: false }));
        addMessage('warning', `No alternative audio available for "${tag}"`);
        return;
      }
    }

    // Map all results first (don't filter by preview yet, but exclude current item)
    const allCandidates: FSItem[] = (data?.results ?? [])
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        duration: r.duration,
        license: r.license,
        username: r.username,
        tags: r.tags,
        previews: r.previews,
        rating: r.rating || 0,
        num_downloads: r.num_downloads || 0,
      }))
      .filter((item: any) => item.id !== L.item?.id); // Exclude current item first

    if (allCandidates.length === 0) {
      console.warn(`[swap] no alternatives found for tag=${tag} (excluding current item)`);
      setSwapping(prev => ({ ...prev, [L.id]: false }));
      addMessage('warning', `No alternative audio found for "${tag}"`);
      return;
    }

    // Score ALL candidates first
    console.log(`[swap] Scoring ${allCandidates.length} alternatives for "${tag}"...`);
    
    const scoredCandidates = allCandidates.map((candidate: any) => {
      let score = 0;
      
      // Rating score (0-5 stars, normalize to 0-1)
      score += (candidate.rating || 0) / 5 * 0.4;
      
      // Downloads score (logarithmic, popular sounds are better)
      const downloads = candidate.num_downloads || 1;
      score += Math.min(Math.log10(downloads) / 4, 1) * 0.3; // Cap at 10k downloads = max score
      
      // Duration score (prefer 30-120 seconds for loops)
      const duration = candidate.duration || 60;
      if (duration >= 30 && duration <= 120) {
        score += 0.2;
      } else if (duration >= 15 && duration <= 240) {
        score += 0.1;
      }
      
      // Title quality score (avoid obvious music indicators)
      const title = (candidate.name || '').toLowerCase();
      if (title.includes('loop') || title.includes('ambient')) {
        score += 0.1;
      }
      if (title.includes('music') || title.includes('song') || title.includes('track')) {
        score -= 0.3;
      }
      if (title.includes('melody') || title.includes('beat') || title.includes('chord')) {
        score -= 0.2;
      }
      
      return { candidate, score };
    });

    // Sort by score (best first)
    scoredCandidates.sort((a: any, b: any) => b.score - a.score);
    
    // Find the best candidate that has a usable preview
    let nextItem: FSItem | null = null;
    let selectedIndex = -1;
    
    for (let i = 0; i < scoredCandidates.length; i++) {
      const { candidate } = scoredCandidates[i];
      if (hasUsablePreview(candidate)) {
        nextItem = candidate;
        selectedIndex = i;
        break;
      } else {
        console.log(`[swap] Skipping candidate ${i + 1}: "${candidate.name}" - no usable preview`);
      }
    }

    if (!nextItem) {
      console.warn(`[swap] no usable alternatives found for tag=${tag} (checked ${scoredCandidates.length} options)`);
      setSwapping(prev => ({ ...prev, [L.id]: false }));
      addMessage('warning', `No playable alternatives found for "${tag}"`);
      return;
    }

    console.log(`[swap] Selected "${nextItem.name}" (score: ${scoredCandidates[selectedIndex].score.toFixed(2)}, rank: ${selectedIndex + 1}/${scoredCandidates.length})`);

    // Try LLM validation for swap if available (as additional context validation)
    if (aiService.isLLMEnabled() && allCandidates.length > 2 && currentPrompt) {
      try {
        const candidatesForLLM = allCandidates.slice(0, 5).map((c: any) => ({
          id: c.id,
          name: c.name || 'Untitled',
          tags: c.tags || [],
          username: c.username || 'Unknown'
        }));
        
        const llmScores = await aiService.scoreAudioOptions(currentPrompt, candidatesForLLM);
        const llmBest = llmScores.reduce((best, current) => 
          current.relevanceScore > best.relevanceScore ? current : best
        );
        const llmChoice = allCandidates.find((c: any) => String(c.id) === llmBest.audioId);
        
        // Only use LLM choice if it has a usable preview AND high relevance
        if (llmChoice && hasUsablePreview(llmChoice) && llmBest.relevanceScore > 0.7) {
          console.log(`[swap] LLM prefers "${llmChoice.name}" (relevance: ${llmBest.relevanceScore.toFixed(2)}): ${llmBest.reasoning}`);
          nextItem = llmChoice;
        }
      } catch (llmErr) {
        console.warn(`[swap] LLM scoring failed for ${tag}:`, llmErr);
        // Continue with scored best item
      }
    }

    setLayers(prev =>
      prev.map(x =>
        x.id === L.id
          ? { ...x, item: nextItem, link: `https://freesound.org/s/${nextItem.id}/` }
          : x
      )
    );

    return new Promise<void>((resolve) => {
      requestAnimationFrame(async () => {
        const a = layerAudioRefs.current[L.id];
        const rawSrc = selectPreviewUrl(nextItem);
        
        if (!a || !rawSrc) {
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
          resolve();
          return;
        }

        const nextSrc = `${rawSrc}${rawSrc.includes("?") ? "&" : "?"}v=${nextItem.id}`;

        setIsLoading(prev => ({ ...prev, [L.id]: true }));
        swappingRef.current.add(L.id);

        const targetVol = effectiveGain(L.id, L.gain);

        try {
          a.pause();
          a.currentTime = 0;
        } catch (e) {
          console.warn(`[swap] pause/reset failed for ${L.id}`, e);
        }

        try {
          a.removeAttribute("src");
          a.load();
          
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (e) {
          console.warn(`[swap] source clearing failed for ${L.id}`, e);
        }

        a.src = nextSrc;
        a.loop = true;
        a.volume = targetVol;
        a.muted = !!mutes[L.id];

        const onLoadSuccess = () => {
          addMessage('success', `Swapped to alternative for "${L.tag}"`);
          // Don't auto-play after swap - let user manually start playback
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
          setSwapping(prev => ({ ...prev, [L.id]: false }));
          swappingRef.current.delete(L.id);
          resolve();
        };

        const onLoadError = () => {
          addMessage('warning', `Failed to load alternative for "${L.tag}"`);
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
          setSwapping(prev => ({ ...prev, [L.id]: false }));
          swappingRef.current.delete(L.id);
          resolve();
        };

        a.addEventListener('canplaythrough', onLoadSuccess, { once: true });
        a.addEventListener('error', onLoadError, { once: true });

        try {
          a.load();
        } catch (e) {
          onLoadError();
        }

        setTimeout(() => {
          if (swappingRef.current.has(L.id)) {
            onLoadError();
          }
        }, 10000);
      });
    });
  }

  function handleDeleteLayer(layerId: string) {
    // Stop and cleanup audio
    const audio = layerAudioRefs.current[layerId];
    if (audio) {
      audio.pause();
      audio.src = '';
      delete layerAudioRefs.current[layerId];
    }

    // remove from all state
    setLayers(prev => prev.filter(L => L.id !== layerId));
    setVolumes(prev => {
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
    setMutes(prev => {
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
    setIsLoading(prev => {
      const next = { ...prev };
      delete next[layerId];
      return next;
    });

    // cleanup swap state
    swappingRef.current.delete(layerId);
    delete alternatesRef.current[layerId];
    delete altIndexRef.current[layerId];

      console.log(`[delete] Removed layer: ${layerId}`);
      addMessage('success', `Removed "${layerId}" layer`);
    }  async function handleAddLayer(tag: string) {
    if (!tag.trim() || !prompt.trim()) return;
    
    addMessage('info', `Adding layer for "${tag}"...`);
    setLoading(true);
    setError(null);

    try {
      const data = await withTimeout(searchOnce(tag), 10_000);
      const results = data.results || [];
      
      if (results.length === 0) {
        throw new Error(`No results found for tag: "${tag}"`);
      }

      const usable = results.filter((r: FSItem) => r && hasUsablePreview(r));
      if (usable.length === 0) {
        throw new Error(`No usable audio found for tag: "${tag}"`);
      }

      let contextualGain = gainForTag(tag);
      
      if (aiAnalysis?.source === 'llm' && mixScale) {
        contextualGain = gainForTag(tag) * mixScale;
      }

      const scored = usable
        .map((r: FSItem) => ({
          item: r,
          score: Math.random() * 0.1 +
            (r.rating || 0) * 0.3 +
            Math.log10((r.num_downloads || 0) + 1) * 0.2 +
            (r.duration && r.duration <= 120 ? 0.4 : 
             r.duration && r.duration <= 300 ? 0.2 : 0.1)
        }))
        .sort((a, b) => b.score - a.score);

      const best = scored[0].item;
      const layerId = `add-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      const newLayer: Layer = {
        id: layerId,
        tag: tag.trim(),
        item: best,
        gain: Math.max(0.1, Math.min(0.6, contextualGain)),
        link: `https://freesound.org/people/${best.username}/sounds/${best.id}/`
      };

      setLayers(prev => [...prev, newLayer]);
      
      alternatesRef.current[layerId] = scored.slice(1, 10).map(s => s.item);
      altIndexRef.current[layerId] = 0;

      addMessage('success', `Added "${tag}" layer successfully`);

    } catch (err) {
      addMessage('error', `Failed to add "${tag}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      setError(`Failed to add "${tag}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }




  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in {
            animation: fadeInUp 0.6s ease-out forwards;
          }
          .animate-fade-in-delay {
            animation: fadeInUp 0.6s ease-out 0.2s forwards;
            opacity: 0;
          }
        `
      }} />
      <div className="flex min-h-screen">
        {/* Left side: Logo, Prompt, Controls */}
        <div className="w-1/2 p-8 flex flex-col overflow-y-auto">
          <div className="space-y-8">
            {/* Logo and Prompt Section */}
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-black italic bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-wide drop-shadow-lg transform hover:scale-105 transition-transform duration-300 select-none">
                Soundscaper
              </h1>

              <div>
                <label className="block text-base font-medium text-gray-200 mb-4">
                  Describe your soundscape
                </label>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-lg bg-gray-900/50 border border-gray-600 px-4 py-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder='e.g., "A walk through the forest at night"'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <button
                    onClick={() => runSearch(prompt)}
                    disabled={loading}
                    className="px-4 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {loading ? "Generating…" : "Generate"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Try: <em>empty subway station at dawn</em> or <em>cozy cabin during a thunderstorm</em>
                </p>
              </div>

              {error && (
                <div className="text-orange-400 text-sm py-2 px-4 bg-orange-900/20 rounded-lg border border-orange-800/30 animate-fade-in">
                  {error}
                </div>
              )}
            </div>

            {/* Transport Controls */}
            {layers.length > 0 && (
              <div className="animate-fade-in">
                <TransportControls
                  layers={layers}
                  loading={loading}
                  clearing={clearing}
                  mixScale={mixScale}
                  rulesScale={rulesScale}
                  devMode={DEV_MODE}
                  onPlayAll={handlePlayAll}
                  onStopAll={handleStopAll}
                  onClearAll={handleClearAll}
                  onClearCache={handleClearCache}
                  onSeedWhitelist={() => seedWhitelistCache(2)}
                  onNudgeMix={nudgeMix}
                  onApplyGlobalScale={applyGlobalScale}
                />
              </div>
            )}

            {DEV_MODE && (
              <p className="text-xs text-purple-400/70 text-center">
                Dev mode active - extra controls enabled
              </p>
            )}

            {/* Layer List */}
            {layers.length > 0 && (
              <div className="animate-fade-in">
                <LayerList
                  layers={layers}
                  volumes={volumes}
                  mutes={mutes}
                  isLoading={isLoading}
                  swapping={swapping}
                  mixScale={mixScale}
                  layerAudioRefs={layerAudioRefs}
                  onVolumeChange={(layerId, value) => setVolumes(prev => ({ ...prev, [layerId]: value }))}
                  onMuteToggle={(layerId) => 
                    setMutes(prev => {
                      const next = { ...prev, [layerId]: !prev[layerId] };
                      const a = layerAudioRefs.current[layerId];
                      if (a) a.muted = next[layerId];
                      return next;
                    })
                  }
                  onSwap={handleSwap}
                  onDelete={handleDeleteLayer}
                />
              </div>
            )}

            {layers.length > 0 && (
              <div className="animate-fade-in">
                <AddLayer
                  prompt={prompt}
                  loading={loading}
                  onAddLayer={handleAddLayer}
                />
              </div>
            )}
          </div>

          {/* Hidden audio elements */}
          <div className="sr-only">
            {layers.map((L) => {
              return (
                <audio
                  key={L.id}
                  ref={(el) => { layerAudioRefs.current[L.id] = el; }}
                  crossOrigin="anonymous"
                  preload="auto"
                  onCanPlayThrough={() => {
                    swappingRef.current.delete(L.id);
                    setIsLoading(prev => ({ ...prev, [L.id]: false }));
                  }}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLAudioElement;
                    const code = el.error?.code ?? 0;
                    if (swappingRef.current.has(L.id) && code === 1) {
                      swappingRef.current.delete(L.id);
                      return;
                    }
                    addMessage('warning', `Audio playback error for "${L.tag}"`);
                    setIsLoading(prev => ({ ...prev, [L.id]: false }));
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Right side: Image and Messages */}
        <div className="w-1/2 p-8 flex flex-col border-l border-gray-800 min-h-screen">
          <div className="space-y-8 flex-1">
            {/* Generated Image Section */}
            {(generatedImage || imageLoading || layers.length > 0) && (
              <div className="relative animate-fade-in">
                {imageLoading ? (
                  <div className="aspect-video bg-gray-900 border-2 border-gray-700 rounded-lg flex items-center justify-center shadow-lg">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                      <div className="text-gray-400 text-sm">Generating image...</div>
                    </div>
                  </div>
                ) : generatedImage ? (
                  <div className="relative group animate-fade-in">
                    {/* Frame effect with padding and border */}
                    <div className="bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-600">
                      <img 
                        src={generatedImage.url} 
                        alt="Generated visualization"
                        className="w-full aspect-video object-cover rounded shadow-md cursor-pointer"
                        onClick={() => setFullscreenImage(true)}
                      />
                    </div>
                    {/* Button overlays */}
                    <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => setFullscreenImage(true)}
                        className="p-2 bg-black/70 hover:bg-black/90 rounded-md transition-all duration-200 backdrop-blur-sm border border-gray-500 text-white"
                        title="View fullscreen"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => generateImage(prompt)}
                        disabled={imageLoading || !aiService.isLLMEnabled()}
                        className="p-2 bg-black/70 hover:bg-black/90 disabled:opacity-50 rounded-md transition-all duration-200 backdrop-blur-sm border border-gray-500 text-white"
                        title="Regenerate image"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : layers.length > 0 ? (
                  <div className="relative">
                    <div className="aspect-video bg-gray-900 border-2 border-gray-700 rounded-lg flex items-center justify-center shadow-lg border-dashed">
                      <div className="text-center text-gray-500">
                        <div className="text-4xl mb-2">🎨</div>
                        <div className="text-sm">Click Generate to create a visual</div>
                      </div>
                    </div>
                    <button
                      onClick={() => generateImage(prompt)}
                      disabled={imageLoading || !aiService.isLLMEnabled()}
                      className="absolute top-4 right-4 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md transition-colors text-white text-sm font-medium"
                    >
                      🎨 Generate
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {/* Messages Section */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-400">Process</h3>
                {aiAnalysis && (
                  <div className="flex items-center gap-3 animate-fade-in">
                    <div className="text-xs text-gray-400" title={aiAnalysis.reasoning || 'AI analysis complete'}>
                      AI: {aiAnalysis.source.toUpperCase()}
                    </div>
                    {aiService.isLLMEnabled() && (
                      <div className="text-xs text-teal-400">
                        LLM Ready
                      </div>
                    )}
                    {cacheStatus && (
                      <div className={`text-xs ${cacheStatus === "HIT"
                        ? "text-teal-400"
                        : cacheStatus === "STALE"
                          ? "text-orange-400"
                          : "text-purple-400"
                        }`}
                      >
                        Cache: {cacheStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="text-xs text-gray-500 italic">
                    Messages will appear here during generation...
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2 text-xs animate-fade-in">
                      <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                           style={{
                             backgroundColor: 
                               msg.type === 'success' ? '#2dd4bf' :
                               msg.type === 'error' ? '#fb923c' :
                               msg.type === 'warning' ? '#a855f7' :
                               '#6b7280'
                           }}
                      />
                      <div className={`flex-1 ${
                        msg.type === 'success' ? 'text-teal-400' :
                        msg.type === 'error' ? 'text-orange-400' :
                        msg.type === 'warning' ? 'text-purple-400' :
                        'text-gray-400'
                      }`}>
                        {msg.text}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen image modal */}
      {fullscreenImage && generatedImage && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img 
              src={generatedImage.url} 
              alt="Generated visualization - Fullscreen"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setFullscreenImage(false)}
              className="absolute top-4 right-4 p-2 bg-black/70 hover:bg-black/90 rounded-md transition-all duration-200 backdrop-blur-sm border border-gray-500 text-white"
              title="Close fullscreen (ESC)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </main>
  );

}