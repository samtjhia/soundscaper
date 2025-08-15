import React, { useEffect, useRef, useState } from 'react';
import { searchOnce } from "./freesound/client";
import { AUTO_RUN_ON_LOAD, SEARCH_DEFAULT_QUERY } from "./config";
import type { FSItem, Layer } from "./types";
import { pickInitialTags, gainForTag } from "./ai/rules";


export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [layers, setLayers] = useState<Layer[]>([]);

  function selectPreviewUrl(item?: FSItem | null): string | null {
    if (!item?.previews) return null;
    return item.previews["preview-lq-mp3"] ?? item.previews["preview-hq-mp3"] ?? null;
  }

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const tags = pickInitialTags(); // e.g. ["roomtone","light_rain","distant_chatter","footsteps_stone"]

      const results = await Promise.all(
        tags.map(async (tag) => {
          const data: any = await searchOnce(tag);
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
            link: `https://freesound.org/s/${item.id}/`, // build link ourselves
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

      // Keep your existing single <audio> flow alive: choose the first layer’s preview
      const firstUrl = selectPreviewUrl(usable[0]?.item ?? null);
      setPreviewUrl(firstUrl ?? null);
      if (!firstUrl) console.warn("No preview URL on first layer");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        try {
          a.pause();
        } catch { }
        a.src = "";
        a.load();
      }
    };
  }, []);

  const handlePlay = () => {
    if (!previewUrl) return;
    const a = audioRef.current;
    if (!a) return;
    a.loop = true;
    a.volume = 0.6;
    a.currentTime = 0;
    a.play().catch((err) => {
      console.warn("Audio play blocked or failed:", err);
    });
  };

  const handleStop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
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
        <p className="text-sm text-gray-300">
          Testing Freesound search for: <code className="text-gray-200">{SEARCH_DEFAULT_QUERY}</code>
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
            onClick={handlePlay}
            disabled={!previewUrl}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
            title={previewUrl ? "Play looped preview" : "Search first"}
          >
            Play (loop)
          </button>

          <button
            onClick={handleStop}
            disabled={!previewUrl}
            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
          >
            Stop
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <p className="text-xs text-gray-500">
          Tip: add <code>?auto=1</code> to the URL to auto-run on page load.
        </p>

        <p className="text-xs text-gray-400">
          {previewUrl ? "Preview ready." : "No preview selected yet."}
        </p>

        {/* hidden audio element controlled via ref */}
        <audio ref={audioRef} src={previewUrl ?? undefined} preload="auto" />
      </div>
    </main>
  );
}
