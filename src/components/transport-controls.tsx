import type { Layer } from '../types';

interface TransportControlsProps {
  layers: Layer[];
  loading: boolean;
  clearing: boolean;
  mixScale: number;
  rulesScale: number;
  onPlayAll: () => void;
  onStopAll: () => void;
  onClearCache: () => void;
  onSeedWhitelist: () => void;
  onNudgeMix: (factor: number) => void;
  onApplyGlobalScale: (scale: number) => void;
}

/**
 * Transport controls component for play/stop/cache management
 * Extracted from App.tsx for better organization
 */
export function TransportControls({
  layers,
  loading,
  clearing,
  mixScale,
  rulesScale,
  onPlayAll,
  onStopAll,
  onClearCache,
  onSeedWhitelist,
  onNudgeMix,
  onApplyGlobalScale,
}: TransportControlsProps) {
  return (
    <>
      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          onClick={onPlayAll}
          disabled={!layers.length}
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          Play All
        </button>
        <button
          onClick={onStopAll}
          disabled={!layers.length}
          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
        >
          Stop All
        </button>
        <button
          onClick={onClearCache}
          className="px-3 py-2 rounded-xl bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50"
          disabled={clearing}
          title="Clear all cached search JSON"
        >
          {clearing ? "Clearing…" : "Clear Cache"}
        </button>
        <button
          onClick={onSeedWhitelist}
          className="px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-600"
          title="Fetch and cache wl:<id> items so fallback can work offline"
        >
          Seed Whitelist
        </button>
      </div>

      {/* Mix Controls */}
      <div className="flex items-center justify-center gap-2 mt-2 text-xs">
        <span className="opacity-70">Mix:</span>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
          onClick={() => onNudgeMix(0.9)}
          disabled={loading || layers.length === 0}
        >
          Calmer −10%
        </button>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
          onClick={() => onNudgeMix(1.1)}
          disabled={loading || layers.length === 0}
        >
          Busier +10%
        </button>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15"
          onClick={() => onApplyGlobalScale(rulesScale)}
          disabled={loading || layers.length === 0}
          title="Reset to the rules-suggested intensity for this prompt"
        >
          Reset
        </button>
        <span className="opacity-60 ml-1">scale: {mixScale.toFixed(2)}</span>
      </div>
    </>
  );
}
