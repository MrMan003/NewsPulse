"use client";

const SOURCE_COLORS = {
  "BBC News": "#BB1919",
  "NPR": "#2A6BCC",
  "Reuters": "#FF8000",
  "The Guardian": "#005689",
  "Al Jazeera": "#003366",
};

export default function SourceFilter({ sources, active, onChange }) {
  const toggle = (src) => {
    if (active.includes(src)) {
      onChange(active.filter((s) => s !== src));
    } else {
      onChange([...active, src]);
    }
  };

  const allActive = active.length === 0 || active.length === sources.length;

  const toggleAll = () => {
    if (allActive) {
      onChange(sources);
    } else {
      onChange([]);
    }
  };

  if (!sources.length) {
    return (
      <div className="text-xs text-text-secondary">
        No sources available
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={toggleAll}
        className={`text-xs px-3 py-1 rounded-full border transition-all ${
          allActive
            ? "bg-text-primary text-white border-text-primary"
            : "border-border text-muted hover:border-text-primary/50"
        }`}
      >
        {allActive ? '✓ All' : 'All'}
      </button>

      {sources.map((src) => {
        const isOn = active.includes(src) || allActive;
        const color = SOURCE_COLORS[src] || "#4F9CF9";
        return (
          <button
            key={src}
            onClick={() => toggle(src)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              isOn 
                ? "text-white border-transparent shadow-sm" 
                : "border-border text-muted hover:border-text-primary/30"
            }`}
            style={isOn ? { background: color, borderColor: color } : {}}
          >
            {src}
          </button>
        );
      })}
    </div>
  );
}