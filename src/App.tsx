import React from "react";
import { searchOnce } from "./freesound/client";

export default function App() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleTestSearch() {
    setLoading(true);
    setError(null);
    try {
      const data = await searchOnce("rain");
      console.log("Freesound search (rain):", data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="h-screen flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">SoundSketch</h1>
        <p className="text-sm text-gray-300">
          Click to test Freesound “rain” search. Check the console.
        </p>
        <button
          onClick={handleTestSearch}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Test Freesound"}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </main>
  );
}
