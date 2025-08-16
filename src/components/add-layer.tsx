import { useState } from 'react';

interface AddLayerProps {
  prompt: string;
  loading: boolean;
  onAddLayer: (tag: string) => void;
}

/**
 * Add layer component for manually adding new layers
 * Extracted from App.tsx for better organization
 */
export function AddLayer({ prompt, loading, onAddLayer }: AddLayerProps) {
  const [addLayerTag, setAddLayerTag] = useState<string>("");

  const handleAdd = () => {
    if (addLayerTag.trim()) {
      onAddLayer(addLayerTag.trim());
      setAddLayerTag("");
    }
  };

  return (
    <div className="mt-6 p-4 bg-white/5 rounded-xl">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">Add Layer</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={addLayerTag}
          onChange={(e) => setAddLayerTag(e.target.value)}
          placeholder="Enter tag (e.g., rain, birds, traffic...)"
          className="flex-1 rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-sm"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && addLayerTag.trim()) {
              handleAdd();
            }
          }}
          disabled={loading}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !addLayerTag.trim()}
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Add sounds that fit your scene: "{prompt}"
      </p>
    </div>
  );
}
