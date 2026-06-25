"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { format } from "date-fns";

const SOURCE_COLORS = {
  "BBC News": "#BB1919",
  "NPR": "#2A6BCC",
  "Reuters": "#FF8000",
  "The Guardian": "#005689",
  "Al Jazeera": "#003366",
};

function sourcePill(source) {
  const color = SOURCE_COLORS[source] || "#4F9CF9";
  return { backgroundColor: color, color: "white" };
}

export default function ClusterDetail({ clusterId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    setError(null);
    api.getCluster(clusterId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId]);

  if (!clusterId) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300" 
        onClick={onClose} 
      />

      {/* Sidebar */}
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out animate-slide-in">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border bg-gray-50/80">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-1">
              Topic Cluster
            </p>
            {loading ? (
              <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            ) : error ? (
              <p className="text-google-red text-sm">{error}</p>
            ) : (
              <h2 className="font-display text-xl font-bold text-text-primary truncate">
                {data?.articles?.[0]?.title || "Cluster Detail"}
              </h2>
            )}
            {data?.articleCount && (
              <p className="text-xs text-text-secondary mt-1">
                {data.articleCount} articles in this cluster
              </p>
            )}
          </div>
          <button 
            onClick={onClose} 
            className="ml-4 text-text-secondary hover:text-text-primary transition-colors text-xl leading-none p-1 hover:bg-gray-100 rounded-full"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-2 animate-pulse">
                <div className="flex items-center space-x-2">
                  <div className="w-16 h-4 bg-gray-200 rounded" />
                  <div className="w-20 h-3 bg-gray-200 rounded" />
                </div>
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
            ))
          )}
          
          {!loading && error && (
            <div className="p-6 text-center bg-red-50 rounded-xl border border-red-200">
              <p className="text-google-red font-medium">Failed to load cluster details</p>
              <p className="text-sm text-text-secondary mt-1">{error}</p>
            </div>
          )}
          
          {!loading && !error && data?.articles?.map((article, index) => (
            <a
              key={index}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gray-50 hover:bg-gray-100 rounded-lg p-4 border border-border/60 hover:border-google-blue transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span 
                  className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
                  style={sourcePill(article.source)}
                >
                  {article.source}
                </span>
                <span className="text-xs text-text-secondary">
                  {format(new Date(article.published_at), "MMM d · HH:mm")}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-text-primary group-hover:text-google-blue transition-colors leading-snug mb-1">
                {article.title}
              </h3>
              {article.summary && (
                <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                  {article.summary}
                </p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-google-blue font-medium group-hover:underline">
                  Read full article →
                </span>
                {article.fetched_at && (
                  <span className="text-[10px] text-text-secondary">
                    Fetched: {format(new Date(article.fetched_at), "MMM d")}
                  </span>
                )}
              </div>
            </a>
          ))}
          
          {!loading && !error && (!data?.articles || data.articles.length === 0) && (
            <div className="p-6 text-center bg-gray-50 rounded-xl border border-border/60">
              <p className="text-text-secondary">No articles found in this cluster.</p>
            </div>
          )}
        </div>
      </aside>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}