import type { Layer } from '../types';
import { Play, Square, Trash, Download, Minus, Plus, RotateCcw } from 'lucide-react';

interface TransportControlsProps {
  layers: Layer[];
  loading: boolean;
  clearing: boolean;
  mixScale: number;
  rulesScale: number;
  devMode?: boolean;
  onPlayAll: () => void;
  onStopAll: () => void;
  onClearCache: () => void;
  onSeedWhitelist: () => void;
  onNudgeMix: (factor: number) => void;
  onApplyGlobalScale: (scale: number) => void;
}


export function TransportControls({
  layers,
  loading,
  clearing,
  mixScale,
  rulesScale,
  devMode = false,
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
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
        >
          <Play size={16} />
          Play All
        </button>
        <button
          onClick={onStopAll}
          disabled={!layers.length}
          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2"
        >
          <Square size={16} />
          Stop All
        </button>
        {devMode && (
          <>
            <button
              onClick={onClearCache}
              className="px-3 py-2 rounded-xl bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2"
              disabled={clearing}
              title="Clear all cached search JSON"
            >
              <Trash size={16} />
              {clearing ? "Clearing…" : "Clear Cache"}
            </button>
            <button
              onClick={onSeedWhitelist}
              className="px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 flex items-center gap-2"
              title="Fetch and cache wl:<id> items so fallback can work offline"
            >
              <Download size={16} />
              Seed Whitelist
            </button>
          </>
        )}
      </div>

      {/* Mix Controls */}
      <div className="flex items-center justify-center gap-2 mt-2 text-xs">
        <span className="opacity-70">Mix:</span>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15 flex items-center gap-1"
          onClick={() => onNudgeMix(0.9)}
          disabled={loading || layers.length === 0}
        >
          <Minus size={14} />
          Calmer −10%
        </button>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15 flex items-center gap-1"
          onClick={() => onNudgeMix(1.1)}
          disabled={loading || layers.length === 0}
        >
          <Plus size={14} />
          Busier +10%
        </button>
        <button
          className="rounded-md px-2 py-1 bg-white/10 hover:bg-white/15 flex items-center gap-1"
          onClick={() => onApplyGlobalScale(rulesScale)}
          disabled={loading || layers.length === 0}
          title="Reset to the rules-suggested intensity for this prompt"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <span className="opacity-60 ml-1">scale: {mixScale.toFixed(2)}</span>
      </div>
    </>
  );
}
