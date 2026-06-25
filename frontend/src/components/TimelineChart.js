"use client";
import { useMemo } from "react";
import { format, differenceInHours } from "date-fns";

const ROW_HEIGHT = 48;
const LABEL_W = 180;
const BAR_PADDING = 4;

function toMs(str) {
  return new Date(str).getTime();
}

export default function TimelineChart({ data, onClusterClick, loading }) {
  const { rows, minMs, maxMs, ticks } = useMemo(() => {
    if (!data?.length) return { rows: [], minMs: 0, maxMs: 1, ticks: [] };

    const allMs = data.flatMap((d) => [toMs(d.startDate), toMs(d.endDate)]);
    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const span = maxMs - minMs || 1;

    const ticks = Array.from({ length: 6 }, (_, i) => {
      const ms = minMs + (span * i) / 5;
      return { ms, label: format(new Date(ms), "MMM d HH:mm") };
    });

    const rows = data.map((d) => {
      const xPct = (toMs(d.startDate) - minMs) / span;
      const wPct = Math.max((toMs(d.endDate) - toMs(d.startDate)) / span, 0.008);
      const intensity = d.intensity ?? 0.5;
      return { ...d, xPct, wPct, intensity };
    });

    return { rows, minMs, maxMs, ticks };
  }, [data]);

  if (loading && data?.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-google-blue border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading timeline...
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        <div className="text-center">
          <p className="text-4xl mb-3">📰</p>
          <p>No clusters yet. Trigger an ingest to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
      <div style={{ minWidth: 700, position: "relative" }}>
        
        {/* Time axis labels */}
        <div className="flex mb-2 text-[10px] font-mono text-muted" style={{ paddingLeft: LABEL_W }}>
          {ticks.map((t, i) => (
            <div key={i} className="flex-1 text-center" style={{ minWidth: 0 }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Clusters */}
        {rows.map((row) => {
          const alpha = 0.4 + row.intensity * 0.6;
          const barH = Math.max(24, Math.min(44, 24 + row.intensity * 20));
          const fontSize = Math.max(10, Math.min(14, 10 + row.intensity * 4));

          return (
            <div key={row.id} className="flex items-center group relative" style={{ height: ROW_HEIGHT }}>
              <div className="shrink-0 pr-3 text-right" style={{ width: LABEL_W }}>
                <span 
                  className="text-xs text-muted group-hover:text-text-primary transition-colors leading-tight block truncate" 
                  title={row.label}
                >
                  {row.label}
                </span>
              </div>

              <div className="flex-1 relative h-full flex items-center">
                {/* Grid lines */}
                <div className="absolute inset-0 flex">
                  {ticks.map((_, i) => (
                    <div key={i} className="flex-1 border-l border-border/30" />
                  ))}
                </div>

                {/* Cluster bar with tooltip */}
                <div className="relative w-full h-full flex items-center">
                  <button
                    className="absolute cluster-bar rounded cursor-pointer hover:z-10 transition-all duration-200 hover:shadow-lg"
                    style={{
                      left: `calc(${row.xPct * 100}%)`,
                      width: `calc(${row.wPct * 100}%)`,
                      height: barH,
                      minWidth: 6,
                      background: `linear-gradient(135deg, rgba(66, 133, 244, ${alpha}), rgba(52, 168, 83, ${alpha * 0.8}))`,
                      border: `1px solid rgba(66, 133, 244, ${Math.min(1, alpha + 0.2)})`,
                      padding: `0 ${BAR_PADDING}px`,
                      display: "flex",
                      alignItems: "center",
                      overflow: "hidden",
                    }}
                    onClick={() => onClusterClick(row.id)}
                    title={row.label}
                  >
                    {row.wPct > 0.07 && (
                      <span className="text-white/90 font-mono truncate select-none" style={{ fontSize }}>
                        {row.sizeMetric}
                      </span>
                    )}
                  </button>
                  
                  {/* Tooltip on hover */}
                  <div className="absolute z-20 invisible group-hover:visible bg-black/90 text-white text-xs rounded-lg px-3 py-2 pointer-events-none whitespace-nowrap bottom-full left-1/2 transform -translate-x-1/2 mb-2 transition-opacity duration-200">
                    <div className="font-bold mb-1">{row.label}</div>
                    <div className="text-gray-300">
                      <span className="font-medium text-white">{row.sizeMetric}</span> articles
                    </div>
                    <div className="text-gray-400 text-[10px] mt-1">
                      {format(new Date(row.startDate), 'MMM d HH:mm')} - {format(new Date(row.endDate), 'MMM d HH:mm')}
                    </div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-black/90"></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}