import React, { useEffect, useRef, useState } from 'react';
import { searchOnce } from "./freesound/client";
import { AUTO_RUN_ON_LOAD, SEARCH_DEFAULT_QUERY } from "./config";

type FSItem = {
  id: number;
  name?: string;
  duration?: number;
  license?: string;
  username?: string;
  tags?: string[];
  previews?: {
    "preview-lq-mp3"?: string;
    "preview-hq-mp3"?: string;
    [key: string]: string | undefined;
  };
};

export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const data: any = await searchOnce(); // uses default query from config
      const rows: FSItem[] = (data?.results ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        duration: r.duration,
        license: r.license,
        username: r.username,
        tags: r.tags,
        previews: r.previews,
      }));

      console.log("Freesound search raw:", data);
      console.table(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          duration: r.duration,
          license: r.license,
          username: r.username,
          tags: (r.tags || []).slice(0, 6).join(", "),
        }))
      );

      const firstWithPreview = rows.find(r => {
        const p = r.previews;
        return !!(p && (p["preview-lq-mp3"] || p["preview-hq-mp3"]));
      });

      const url =
        firstWithPreview?.previews?.["preview-lq-mp3"] ??
        firstWithPreview?.previews?.["preview-hq-mp3"] ??
        null;

      setPreviewUrl(url);
      if (url) {
        console.log("Selected preview URL:", url);
      } else {
        console.warn("No usable preview URL found in results.");
      }
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
        } catch {}
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
