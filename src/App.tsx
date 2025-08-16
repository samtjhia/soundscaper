import React, { useEffect, useState } from 'react';
import { searchOnce, getById } from "./freesound/client";
import { AUTO_RUN_ON_LOAD, SEARCH_DEFAULT_QUERY, CACHE_TTL_MS, FETCH_VERSION } from "./config";
import type { FSItem, Layer } from "./types";
import { gainForTag } from "./ai/rules";
import { aiService } from "./ai/ai-service";
import { getCache, setCache, clearOldCache, clearOldVersions, clearAllCache } from "./cache/idb";
import { allWhitelist, pickWhitelist, WL_CACHE_PREFIX } from "./freesound/whitelist";



export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [layers, setLayers] = useState<Layer[]>([]);

  const layerAudioRefs = React.useRef<Record<string, HTMLAudioElement | null>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [mutes, setMutes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    source: 'llm' | 'rules' | 'fallback';
    confidence: number;
    reasoning?: string;
  } | null>(null);

  const alternatesRef = React.useRef<Record<string, FSItem[]>>({});
  const altIndexRef = React.useRef<Record<string, number>>({});

  const swappingRef = React.useRef<Set<string>>(new Set());



  async function handleClearCache() {
    try {
      setClearing(true);
      await clearAllCache();
      console.log("[cache] CLEARED ALL");
      setCacheStatus(null);
    } finally {
      setClearing(false);
    }
  }

  const [prompt, setPrompt] = React.useState<string>(SEARCH_DEFAULT_QUERY || "rural alley dusk light rain");
  function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }

  function effectiveGain(id: string, base: number) {
    const rel = volumes[id] ?? base;
    return clamp01(rel * mixScale);
  }

  const [mixScale, setMixScale] = React.useState(1);
  const [rulesScale, setRulesScale] = React.useState(1);

  function hasUsablePreview(item?: FSItem | null): boolean {
    if (!item?.previews) return false;
    return Boolean(
      item.previews["preview-lq-mp3"] ||
      item.previews["preview-hq-mp3"] ||
      item.previews["preview-hq-ogg"] ||
      item.previews["preview-lq-ogg"]
    );
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
        console.warn("pause failed", id, e);
      }
    }

    setIsLoading({});
    setMutes({});
    setVolumes({});
    setLayers([]);
  }

  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  async function seedWhitelistCache(maxPerTag = 2) {
    const wl = allWhitelist(); // { tag: number[] }
    for (const [tag, ids] of Object.entries(wl)) {
      const pick = ids.slice(0, maxPerTag);
      for (const id of pick) {
        const key = `${FETCH_VERSION}:${WL_CACHE_PREFIX}${id}`;
        try {
          const hit = await getCache<any>(key);
          if (hit?.data) {
            console.log(`[seed] HIT ${tag} id=${id} -> ${key}`);
            continue;
          }
          const item = await getById(id);
          await setCache(key, item);
          console.log(`[seed] STORED ${tag} id=${id} -> ${key}`);
        } catch (e) {
          console.warn(`[seed] failed ${tag} id=${id}`, e);
        }
      }
    }
    console.log("[seed] done");
  }


  async function runSearch(promptOverride?: string) {
    setLoading(true);
    setError(null);
    setAiAnalysis(null);

    beginSceneRebuild();

    const p = (promptOverride ?? prompt ?? "").trim();

    try {
      // Use AI service instead of hardcoded rules
      console.log("[AI] Starting analysis for prompt:", p);
      const aiResult = await aiService.analyzePrompt(p);
      
      setAiAnalysis({
        source: aiResult.source,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning
      });

      const { tags, gainScale, baseGainsMap } = aiResult;
      setRulesScale(gainScale);
      setMixScale(gainScale);

      console.log("[AI] Analysis complete:", { 
        source: aiResult.source, 
        tags, 
        gainScale, 
        confidence: aiResult.confidence,
        tagsToAvoid: aiResult.llmSuggestions?.tagsToAvoid 
      });

      // Use prompt-only cache key to ensure consistent hits for same user input
      const cacheKey = `${FETCH_VERSION}:prompt|${p.toLowerCase()}`;
      
      console.log("[cache] Using prompt-based key:", cacheKey);

      clearOldCache(CACHE_TTL_MS).catch(() => { });
      await clearOldVersions(FETCH_VERSION + ":");

      const cached = await getCache<{ byTag: Record<string, any> }>(cacheKey);
      let byTag: Record<string, any> | null = null;
      const isFresh = cached ? (Date.now() - cached.timestamp) <= CACHE_TTL_MS : false;

      if (cached && isFresh && cached.data?.byTag) {
        byTag = cached.data.byTag;
        console.log("[cache] HIT (fresh)", cacheKey, "prompt=", p, "tags=", tags.join(", "));
        setCacheStatus("HIT");
      } else {
        if (cached && !isFresh) {
          console.log("[cache] STALE (expired)", cacheKey, "prompt=", p);
          setCacheStatus("STALE");
        } else {
          console.log("[cache] MISS", cacheKey, "prompt=", p);
          setCacheStatus("MISS");
        }

        const entries = await Promise.all(
          tags.map(async (tag) => {
            let data: any = null;
            if (!DEV_FORCE_FALLBACK) {
              try {
                data = await withTimeout(searchOnce(tag), 10_000);
              } catch (err) {
                console.warn(`[${tag}] search failed or timed out`, err);
              }
            }

            if (!data || !(Array.isArray(data.results) && data.results.length > 0)) {
              const wid = pickWhitelist(tag);
              if (wid != null) {
                const wlKey = `${FETCH_VERSION}:${WL_CACHE_PREFIX}${wid}`;

                try {
                  const cachedWl = await getCache<any>(wlKey);
                  if (cachedWl?.data) {
                    console.log(`[${tag}] whitelist HIT`, wid);
                    data = { results: [cachedWl.data] };
                  } else {
                    const item = await getById(wid);
                    await setCache(wlKey, item);
                    console.log(`[${tag}] whitelist STORED`, wid);
                    data = { results: [item] };
                  }
                } catch (e) {
                  console.error(`[${tag}] whitelist fetch failed`, e);
                  data = null;
                }
              } else {
                console.warn(`[${tag}] no whitelist ID available`);
              }
            }

            return [tag, data] as const;
          })
        );

        byTag = Object.fromEntries(entries);

        await setCache(cacheKey, { byTag });
        console.log("[cache] STORED", cacheKey, "for tags=", tags.join(", "));
      }

      const results = await Promise.all(
        tags.map(async (tag) => {
          const data = byTag?.[tag];
          const rawResults = data?.results ?? [];
          console.log(`[${tag}] Raw search results:`, rawResults.length);
          
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
            console.warn(`[${tag}] no search results at all`);
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
          let selectedIndex = -1;
          
          for (let i = 0; i < scoredCandidates.length; i++) {
            const { candidate } = scoredCandidates[i];
            if (hasUsablePreview(candidate)) {
              bestItem = candidate;
              selectedIndex = i;
              break;
            } else {
              console.log(`[${tag}] Skipping candidate ${i + 1}: "${candidate.name}" - no usable preview`);
            }
          }

          if (!bestItem) {
            console.warn(`[${tag}] no candidates with usable previews found (checked ${scoredCandidates.length} options)`);
            return null;
          }

          console.log(`[${tag}] Selected "${bestItem.name}" (score: ${scoredCandidates[selectedIndex].score.toFixed(2)}, rank: ${selectedIndex + 1}/${scoredCandidates.length})`);

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
                console.log(`[${tag}] LLM prefers "${llmChoice.name}" (relevance: ${llmBest.relevanceScore.toFixed(2)}): ${llmBest.reasoning}`);
                bestItem = llmChoice;
              }
            } catch (error) {
              console.warn(`[${tag}] LLM scoring failed:`, error);
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
        console.log(`[FALLBACK] Attempt ${fallbackAttempts}: Only ${usable.length}/${targetSounds} sounds found. Trying fallback tags...`);
        
        try {
          // Get fallback tags from LLM
          const failedTags = tags.filter(tag => !usable.some(layer => layer.tag === tag));
          console.log(`[FALLBACK] Failed tags:`, failedTags);
          
          if (aiService.isLLMEnabled()) {
            const fallbackPrompt = `The original tags [${failedTags.join(', ')}] failed to find audio for "${p}". Suggest ${targetSounds - usable.length} alternative single-word tags that would create similar atmosphere but are more likely to have audio samples available. Return only the tags, comma-separated.`;
            
            // Use LLM service directly instead of fetch
            const fallbackTags = await aiService.generateFallbackTags(fallbackPrompt, targetSounds - usable.length);
            console.log(`[FALLBACK] Trying alternative tags:`, fallbackTags);
            
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
                      console.log(`[FALLBACK] Found "${bestItem.name}" for tag "${tag}"`);
                      
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
            console.log(`[FALLBACK] Added ${newLayers.length} new sounds. Total: ${usable.length}`);
            
            if (newLayers.length === 0) {
              console.log(`[FALLBACK] No new sounds found, stopping fallback attempts`);
              break;
            }
          } else {
            console.log(`[FALLBACK] LLM not available, skipping fallback`);
            break;
          }
        } catch (fallbackErr) {
          console.warn(`[FALLBACK] Fallback attempt ${fallbackAttempts} failed:`, fallbackErr);
        }
      }
      
      setLayers(usable);

      console.table(
        usable.map((L) => ({
          id: L.id,
          tag: L.tag,
          gain: L.gain,
          name: L.item?.name,
          by: L.item?.username,
          license: L.item?.license,
          previewUrl: (selectPreviewUrl(L.item) ?? "").slice(0, 60) + "...",
        }))
      );
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function applyGlobalScale(newScale: number) {
    setMixScale(newScale);

    for (const id of Object.keys(layerAudioRefs.current)) {
      const a = layerAudioRefs.current[id];
      if (!a) continue;
      const L = layers.find(x => x.id === id);
      if (!L) continue;
      a.volume = effectiveGain(id, L.gain);
    }
  }

  function nudgeMix(factor: number) {
    const target = clamp01(mixScale * factor);
    applyGlobalScale(target);
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
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a || !L.item) continue;
      
      const rawSrc = selectPreviewUrl(L.item);
      if (!rawSrc) {
        console.warn(`[init] No preview URL for layer ${L.id}`);
        setIsLoading(prev => ({ ...prev, [L.id]: false }));
        continue;
      }

      const src = `${rawSrc}${rawSrc.includes("?") ? "&" : "?"}v=${L.item.id}`;
      
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
    }
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


  const handlePlayAll = () => {
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;

      if (!a.src) {
        console.warn(`[play] No src set for ${L.id}, skipping play`);
        continue;
      }

      a.volume = effectiveGain(L.id, L.gain);

      if (mutes && typeof mutes[L.id] === "boolean") {
        a.muted = !!mutes[L.id];
      }

      a.loop = true;
      a.currentTime = 0;

      a.play().catch(err => {
        if (a.readyState < 2) {
          console.log(`[play] Audio not ready for ${L.id}, readyState: ${a.readyState}, waiting...`);
          const onReady = () => {
            a.currentTime = 0;
            a.play().catch(err => {
              console.warn("delayed play failed", L.id, err);
            });
          };
          a.addEventListener('canplay', onReady, { once: true });
        } else {
          console.warn("play failed", L.id, err);
        }
      });
    }
  };


  const handleStopAll = () => {
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;
      a.pause();
      a.currentTime = 0;
    }
  };

  // read once on mount
  const params = new URLSearchParams(window.location.search);
  const DEV_FORCE_FALLBACK = params.get("fallback") === "1";

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
          return;
        }
      } else {
        console.warn(`[swap] no search results and no whitelist for tag=${tag}`);
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

        const wasPlaying = !a.paused;
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
          console.log(`[swap] successfully loaded ${L.id} -> ${nextItem.id}`);
          if (wasPlaying) {
            a.currentTime = 0;
            a.play().catch(err => {
              console.warn("swap play failed", L.id, err);
              setIsLoading(prev => ({ ...prev, [L.id]: false }));
              swappingRef.current.delete(L.id);
            });
          } else {
            setIsLoading(prev => ({ ...prev, [L.id]: false }));
            swappingRef.current.delete(L.id);
          }
          resolve();
        };

        const onLoadError = (e: Event) => {
          console.error(`[swap] failed to load ${L.id} -> ${nextItem.id}`, e);
          setIsLoading(prev => ({ ...prev, [L.id]: false }));
          swappingRef.current.delete(L.id);
          resolve();
        };

        a.addEventListener('canplaythrough', onLoadSuccess, { once: true });
        a.addEventListener('error', onLoadError, { once: true });

        try {
          a.load();
        } catch (e) {
          console.warn(`[swap] load() failed for ${L.id}`, e);
          onLoadError(e as Event);
        }

        setTimeout(() => {
          if (swappingRef.current.has(L.id)) {
            console.warn(`[swap] timeout for ${L.id}`);
            onLoadError(new Event('timeout'));
          }
        }, 10000);
      });
    });
  }




  return (
    <main className="h-screen flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">SoundSketch</h1>
        
        {/* AI Analysis Status */}
        {aiAnalysis && (
          <div className="flex items-center justify-center gap-2">
            <div
              className={`text-xs px-2 py-1 rounded ${
                aiAnalysis.source === 'llm' 
                  ? "bg-purple-700 text-purple-100" 
                  : aiAnalysis.source === 'fallback'
                  ? "bg-orange-700 text-orange-100"
                  : "bg-blue-700 text-blue-100"
              }`}
              title={aiAnalysis.reasoning || 'AI analysis complete'}
            >
              AI: {aiAnalysis.source.toUpperCase()} ({(aiAnalysis.confidence * 100).toFixed(0)}%)
            </div>
            {aiService.isLLMEnabled() && (
              <div className="text-xs px-2 py-1 rounded bg-green-700 text-green-100">
                🤖 LLM Ready
              </div>
            )}
          </div>
        )}
        
        {/* Cache Status */}
        {cacheStatus && (
          <div
            className={`text-xs px-2 py-1 rounded ${cacheStatus === "HIT"
              ? "bg-emerald-700 text-emerald-100"
              : cacheStatus === "STALE"
                ? "bg-amber-700 text-amber-100"
                : "bg-rose-700 text-rose-100"
              }`}
          >
            Cache: {cacheStatus}
          </div>
        )}
        <p className="text-sm text-gray-300">
          Prompt: <code className="text-gray-200">{prompt}</code>
        </p>


        <div className="w-full max-w-lg mx-auto mt-2">
          <div className="flex items-center justify-center gap-2">
            <input
              className="flex-1 rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm"
              placeholder='Describe a vibe… e.g., "quiet neon city at night with light rain"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              onClick={() => runSearch(prompt)}
              disabled={loading}
              className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Try: <em>quiet neon city night drizzle</em> or <em>rural alley dusk light rain</em>
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => runSearch(prompt)}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Test Freesound"}
          </button>

          <button
            onClick={handlePlayAll}
            disabled={!layers.length}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            Play All
          </button>
          <button
            onClick={handleStopAll}
            disabled={!layers.length}
            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
          >
            Stop All
          </button>
          <button
            onClick={handleClearCache}
            className="px-3 py-2 rounded-xl bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50"
            disabled={clearing}
            title="Clear all cached search JSON"
          >
            {clearing ? "Clearing…" : "Clear Cache"}
          </button>
          <button
            onClick={() => seedWhitelistCache(2)}
            className="px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-600"
            title="Fetch and cache wl:<id> items so fallback can work offline"
          >
            Seed Whitelist
          </button>

        </div>

        <div className="flex items-center justify-center gap-2 mt-2 text-xs">
          <span className="opacity-70">Mix:</span>
          <button
            className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
            onClick={() => nudgeMix(0.9)}
            disabled={loading || layers.length === 0}
          >
            Calmer −10%
          </button>
          <button
            className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
            onClick={() => nudgeMix(1.1)}
            disabled={loading || layers.length === 0}
          >
            Busier +10%
          </button>
          <button
            className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
            onClick={() => applyGlobalScale(rulesScale)}
            disabled={loading || layers.length === 0}
            title="Reset to the rules-suggested intensity for this prompt"
          >
            Reset
          </button>
          <span className="opacity-60 ml-1">scale: {mixScale.toFixed(2)}</span>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <p className="text-xs text-gray-500">
          Tip: add <code>?auto=1</code> to the URL to auto-run on page load.
        </p>

        {layers.length > 0 ? (
          <div className="mt-4 grid gap-3 max-w-lg mx-auto text-left">
            {layers.map((L) => {
              const v = effectiveGain(L.id, L.gain);
              return (
                <div key={L.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                      {L.tag}
                      {isLoading[L.id] && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
                          loading…
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setMutes(prev => {
                            const next = { ...prev, [L.id]: !prev[L.id] };
                            const a = layerAudioRefs.current[L.id];
                            if (a) a.muted = next[L.id];
                            return next;
                          })
                        }
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15"
                        aria-pressed={mutes[L.id] ? "true" : "false"}
                        title={mutes[L.id] ? "Unmute" : "Mute"}
                      >
                        {mutes[L.id] ? "Unmute" : "Mute"}
                      </button>

                      <button
                        onClick={() => handleSwap(L)}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15"
                        title="Swap to a different take"
                      >
                        Swap
                      </button>


                      <div className="text-xs text-gray-300 tabular-nums w-16 text-right">
                        {(v * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={v}
                    onChange={(e) => {
                      const effective = parseFloat(e.target.value);
                      const rel = clamp01(effective / mixScale || 0);
                      setVolumes((prev) => ({ ...prev, [L.id]: rel }));
                      const a = layerAudioRefs.current[L.id];
                      if (a) a.volume = effective;
                    }}

                    disabled={!!isLoading[L.id]}
                    className="w-full mt-2 accent-emerald-400 disabled:opacity-50"
                    aria-label={`${L.tag} volume`}
                  />
                  <div className="mt-2 text-xs text-gray-300">
                    <div className="opacity-90">
                      {L.item?.name} — by {L.item?.username}
                    </div>
                    <div className="opacity-70">
                      {L.item?.license}
                      {L.link ? (
                        <>
                          {" • "}
                          <a
                            className="underline"
                            href={L.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            link
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-3">
            No layers yet. Click <em>Test Freesound</em> to build layers.
          </p>
        )}

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
                  console.warn("Audio error", L.id, { code, src: el.currentSrc || el.src });
                  setIsLoading(prev => ({ ...prev, [L.id]: false }));
                }}
              />
            );
          })}
        </div>

      </div>
    </main>
  );

}