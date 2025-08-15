import React from "react";
import { searchOnce } from "./freesound/client";

type FSItem = {
  id: number;
  name?: string;
  duration?: number;
  license?: string;
  username?: string;
  tags?: string[];
  previews?: Record<string, string>;
};

export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const data: any = await searchOnce("rain");
      const rows: FSItem[] = (data?.results ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        duration: r.duration,
        license: r.license,
        username: r.username,
        tags: r.tags,
        previews: r.previews,
      }));

      console.log("Freesound search (rain) raw:", data);
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
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // for auto-run make URL have ?auto=1
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "1") {
      runSearch();
    }
  }, []);

  return (
    <main className="h-screen flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">SoundSketch</h1>
        <p className="text-sm text-gray-300">
          Click to test Freesound “rain” search. Check the console.
        </p>
        <button
          onClick={runSearch}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Test Freesound"}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <p className="text-xs text-gray-500">
          Tip: add <code>?auto=1</code> to the URL to auto-run on page load.
        </p>
      </div>
    </main>
  );
}
