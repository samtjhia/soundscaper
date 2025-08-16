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
  onClearAll: () => void;
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
  onClearAll,
  onClearCache,
  onSeedWhitelist,
  onNudgeMix,
  onApplyGlobalScale,
}: TransportControlsProps) {
  return (
    <div className="my-6">
      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onPlayAll}
          disabled={!layers.length}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 flex items-center gap-2 font-medium"
        >
          <Play size={16} />
          Play All
        </button>
        <button
          onClick={onStopAll}
          disabled={!layers.length}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2 font-medium"
        >
          <Square size={16} />
          Stop All
        </button>
        <button
          onClick={onClearAll}
          disabled={!layers.length}
          className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 flex items-center gap-2 font-medium"
        >
          <Trash size={16} />
          Clear All
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
      <div className="flex items-center justify-center gap-2 mt-3 text-sm">
        <span className="text-gray-400 mr-1">Mix:</span>
        <button
          className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/15 flex items-center gap-1.5 text-xs font-medium"
          onClick={() => onNudgeMix(0.9)}
          disabled={loading || layers.length === 0}
        >
          <Minus size={12} />
          Calmer
        </button>
        <button
          className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/15 flex items-center gap-1.5 text-xs font-medium"
          onClick={() => onNudgeMix(1.1)}
          disabled={loading || layers.length === 0}
        >
          <Plus size={12} />
          Busier
        </button>
        <button
          className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/15 flex items-center gap-1.5 text-xs font-medium"
          onClick={() => onApplyGlobalScale(rulesScale)}
          disabled={loading || layers.length === 0}
          title="Reset mix scale and all slider positions to original values"
        >
          <RotateCcw size={12} />
          Reset
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-200 ${
                mixScale < 0.8 ? 'bg-blue-400' : 
                mixScale > 1.2 ? 'bg-orange-400' : 
                'bg-teal-400'
              }`}
              style={{ width: `${Math.min(100, mixScale * 50)}%` }}
            />
          </div>
          <span className="text-gray-400 text-xs tabular-nums min-w-[2.5rem]">
            {mixScale.toFixed(2)}x
          </span>
        </div>
      </div>
    </div>
  );
}
