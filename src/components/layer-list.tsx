import type { Layer } from '../types';
import { clamp01 } from '../audio/audio-manager';
import { Volume2, VolumeX, RefreshCw, Trash2, Scale3d } from 'lucide-react';

interface LayerListProps {
  layers: Layer[];
  volumes: Record<string, number>;
  mutes: Record<string, boolean>;
  isLoading: Record<string, boolean>;
  swapping: Record<string, boolean>;
  mixScale: number;
  layerAudioRefs: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
  onVolumeChange: (layerId: string, value: number) => void;
  onMuteToggle: (layerId: string) => void;
  onSwap: (layer: Layer) => void;
  onDelete: (layerId: string) => void;
}


export function LayerList({
  layers,
  volumes,
  mutes,
  isLoading,
  swapping,
  mixScale,
  layerAudioRefs,
  onVolumeChange,
  onMuteToggle,
  onSwap,
  onDelete,
}: LayerListProps) {
  if (layers.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-3">
        No layers yet. Click <em>Generate</em> to build layers.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 text-left w-full">
      {layers.map((L) => {
        const sliderValue = volumes[L.id] ?? L.gain; // Raw slider value (0-1)
        return (
          <div key={L.id} className="rounded-xl bg-white/5 p-3 w-full min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                {L.tag}
                {isLoading[L.id] && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
                    loading…
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onMuteToggle(L.id)}
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15 flex items-center gap-1"
                  aria-pressed={mutes[L.id] ? "true" : "false"}
                  title={mutes[L.id] ? "Unmute" : "Mute"}
                >
                  {mutes[L.id] ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span className="sr-only">{mutes[L.id] ? "Unmute" : "Mute"}</span>
                </button>

                <button
                  onClick={() => onSwap(L)}
                  disabled={swapping[L.id]}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                    swapping[L.id] 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white/10 hover:bg-white/15'
                  }`}
                  title={swapping[L.id] ? "Searching for alternative..." : "Swap to a different take"}
                >
                  <RefreshCw size={14} className={swapping[L.id] ? 'animate-spin' : ''} />
                  <span className="sr-only">{swapping[L.id] ? "Swapping..." : "Swap"}</span>
                </button>

                <button
                  onClick={() => onDelete(L.id)}
                  className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 flex items-center gap-1"
                  title="Delete this layer"
                >
                  <Trash2 size={14} />
                  <span className="sr-only">Delete</span>
                </button>

                <div className="text-xs text-gray-300 tabular-nums min-w-[2.5rem] text-center ml-1">
                  {(sliderValue * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sliderValue}
              onChange={(e) => {
                const newSliderValue = parseFloat(e.target.value);
                onVolumeChange(L.id, newSliderValue);
                const a = layerAudioRefs.current[L.id];
                if (a) a.volume = clamp01(newSliderValue * mixScale);
              }}
              disabled={!!isLoading[L.id]}
              className="w-full mt-2 accent-emerald-400 disabled:opacity-50"
              aria-label={`${L.tag} volume`}
            />
            <div className="mt-2 text-xs text-gray-300 min-w-0">
              <div className="opacity-90 truncate">
                {L.item?.name} — by {L.item?.username}
              </div>
              <div className="opacity-70 truncate flex items-center gap-1">
                <Scale3d size={12} />
                {L.item?.license}
                {L.link ? (
                  <>
                    {" • "}
                    <a
                      className="underline hover:text-gray-100 transition-colors"
                      href={L.link}
                      target="_blank"
                      rel="noreferrer"
                      title="View on Freesound"
                    >
                      source
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
