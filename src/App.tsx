import React, { useEffect, useRef, useState } from 'react';
import { searchOnce } from "./freesound/client";
import { AUTO_RUN_ON_LOAD, SEARCH_DEFAULT_QUERY, CACHE_TTL_MS } from "./config";
import type { FSItem, Layer } from "./types";
import { pickInitialTags, gainForTag } from "./ai/rules";
import { getCache, setCache, clearOldCache, clearOldVersions } from "./cache/idb";
import { hashPromptTagsWithGains } from "./cache/hash";


export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [layers, setLayers] = useState<Layer[]>([]);

  const layerAudioRefs = React.useRef<Record<string, HTMLAudioElement | null>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [mutes, setMutes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const [cacheStatus, setCacheStatus] = useState<string | null>(null);


  function selectPreviewUrl(item?: FSItem | null): string | null {
    if (!item?.previews) return null;
    return item.previews["preview-lq-mp3"] ?? item.previews["preview-hq-mp3"] ?? null;
  }

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const tags = pickInitialTags();
      const prompt = "test-prompt"; //FOR NOW
      const gainsMap = Object.fromEntries(tags.map(tag => [tag, gainForTag(tag)]));
      const cacheKey = hashPromptTagsWithGains(prompt, tags, gainsMap);

      clearOldCache(CACHE_TTL_MS).catch(() => { });
      await clearOldVersions("v3:");

      const cached = await getCache<{ byTag: Record<string, any> }>(cacheKey);
      let byTag: Record<string, any> | null = null;

      const isFresh = cached ? (Date.now() - cached.timestamp) <= CACHE_TTL_MS : false;

      if (cached && isFresh && cached.data?.byTag) {
        byTag = cached.data.byTag;
        console.log("[cache] HIT (fresh)", cacheKey, "prompt=", prompt, "tags=", tags.join(", "));
        setCacheStatus("HIT");
      } else {
        if (cached && !isFresh) {
          console.log("[cache] STALE (expired)", cacheKey, "prompt=", prompt);
          setCacheStatus("STALE");
        } else {
          console.log("[cache] MISS", cacheKey, "prompt=", prompt);
          setCacheStatus("MISS");
        }

        // fetch each tag from Freesound
        const entries = await Promise.all(
          tags.map(async (tag) => {
            const data: any = await searchOnce(tag);
            return [tag, data] as const;
          })
        );
        byTag = Object.fromEntries(entries);

        // store fresh JSON
        await setCache(cacheKey, { byTag });
        console.log("[cache] STORED", cacheKey, "for tags=", tags.join(", "));
      }

      // build layers from byTag (cached or fresh)
      const results = await Promise.all(
        tags.map(async (tag) => {
          const data = byTag?.[tag];
          const rows: FSItem[] = (data?.results ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            duration: r.duration,
            license: r.license,
            username: r.username,
            tags: r.tags,
            previews: r.previews,
          }));

          const item = rows.find(
            (r) => !!(r.previews?.["preview-lq-mp3"] || r.previews?.["preview-hq-mp3"])
          );
          if (!item) {
            console.warn(`[${tag}] no usable preview found`);
            return null;
          }

          const layer: Layer = {
            id: `${tag}-${item.id}`,
            tag,
            item,
            gain: gainForTag(tag),
            link: `https://freesound.org/s/${item.id}/`,
          };
          return layer;
        })
      );

      const usable = results.filter((x): x is Layer => !!x);
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
      a.loop = true;
      a.currentTime = 0;
      a.play().catch(err => console.warn("play failed", L.id, err));
    }
  };

  const handleStopAll = () => {
    for (const L of layers) {
      const a = layerAudioRefs.current[L.id];
      if (!a) continue;
      try { a.pause(); a.currentTime = 0; } catch { }
    }
  };


  // for auto-run make URL have ?auto=1
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoFromUrl = params.get("auto") === "1";
    if (autoFromUrl || AUTO_RUN_ON_LOAD) {
      runSearch();
    }
  }, []);

  return (
    <main className="h-screen flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">SoundSketch</h1>
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
          Testing Freesound search for:{" "}
          <code className="text-gray-200">{SEARCH_DEFAULT_QUERY}</code>
        </p>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={runSearch}
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
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <p className="text-xs text-gray-500">
          Tip: add <code>?auto=1</code> to the URL to auto-run on page load.
        </p>

        {layers.length > 0 ? (
          <div className="mt-4 grid gap-3 max-w-lg mx-auto text-left">
            {layers.map((L) => {
              const v = volumes[L.id] ?? L.gain;
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
                      const nv = parseFloat(e.target.value);
                      setVolumes((prev) => ({ ...prev, [L.id]: nv }));
                      const a = layerAudioRefs.current[L.id];
                      if (a) a.volume = nv;
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
            const src = selectPreviewUrl(L.item) ?? undefined;
            return (
              <audio
                key={L.id}
                ref={(el) => { layerAudioRefs.current[L.id] = el; }}
                src={src}
                preload="auto"
                onCanPlayThrough={() =>
                  setIsLoading(prev => ({ ...prev, [L.id]: false }))
                }
                onError={(e) => {
                  console.warn("Audio error", L.id, e);
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
