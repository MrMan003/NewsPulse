"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function Dashboard() {
  const [timeline, setTimeline] = useState([]);
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeCluster, setActiveCluster] = useState(null);
  const [clusterDetails, setClusterDetails] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [timelineView, setTimelineView] = useState("list");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Blueish color palette
  const colors = {
    primary: "#0A1628",
    secondary: "#1A56DB",
    accent: "#3B82F6",
    accentLight: "#DBEAFE",
    background: "#F8FAFC",
    border: "#E2E8F0",
    text: "#0A1628",
    textSecondary: "#475569",
    textLight: "#94A3B8",
    white: "#FFFFFF",
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/ingest/trigger`, { method: "POST" });
      if (res.ok) {
        const { jobId } = await res.json();
        const interval = setInterval(async () => {
          const statusRes = await fetch(`${API_BASE}/ingest/status/${jobId}`);
          if (statusRes.ok) {
            const job = await statusRes.json();
            if (job.status === "completed" || job.status === "failed") {
              clearInterval(interval);
              setIsRefreshing(false);
              await fetchTimelineData();
              if (job.status === "completed") {
                showToast('News updated!', 'success');
              }
              // Reset countdown after refresh
              setCountdown(refreshInterval);
            }
          }
        }, 3000);
      } else {
        setIsRefreshing(false);
      }
    } catch (err) {
      console.error("Error:", err);
      setIsRefreshing(false);
    }
  };

  const fetchTimelineData = async () => {
    try {
      const [timelineRes, sourcesRes] = await Promise.all([
        fetch(`${API_BASE}/timeline`),
        fetch(`${API_BASE}/sources`)
      ]);

      if (timelineRes.ok && sourcesRes.ok) {
        const timelineData = await timelineRes.json();
        const sourcesData = await sourcesRes.json();
        setTimeline(timelineData);
        setSources(sourcesData);
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh) {
      // Start countdown
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Trigger refresh when countdown reaches 0
            triggerRefresh();
            return refreshInterval;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      };
    } else {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      setCountdown(refreshInterval);
    }
  }, [autoRefresh, refreshInterval]);

  useEffect(() => {
    fetchTimelineData();
  }, []);

  useEffect(() => {
    if (!activeCluster) return;
    async function fetchDetails() {
      try {
        const res = await fetch(`${API_BASE}/clusters/${activeCluster}`);
        if (res.ok) {
          const data = await res.json();
          setClusterDetails(data);
        }
      } catch (err) {
        console.error("Error fetching cluster details:", err);
      }
    }
    fetchDetails();
  }, [activeCluster]);

  const getCategory = (label) => {
    const lower = label.toLowerCase();
    if (lower.includes('tech') || lower.includes('ai')) return 'Technology';
    if (lower.includes('business') || lower.includes('economy')) return 'Business';
    if (lower.includes('politics') || lower.includes('government')) return 'Politics';
    if (lower.includes('health') || lower.includes('medical')) return 'Health';
    if (lower.includes('sport') || lower.includes('football')) return 'Sport';
    if (lower.includes('climate') || lower.includes('weather')) return 'Climate';
    if (lower.includes('world') || lower.includes('international')) return 'World';
    return 'News';
  };

  const categories = ['All', 'World', 'Politics', 'Business', 'Technology', 'Sport', 'Health', 'Climate'];

  const getSourceColor = (sourceName) => {
    const src = sourceName?.toLowerCase() || "";
    if (src.includes("bbc")) return "#1A56DB";
    if (src.includes("reuters")) return "#3B82F6";
    if (src.includes("bloomberg")) return "#0A1628";
    if (src.includes("techcrunch")) return "#475569";
    if (src.includes("guardian")) return "#1A56DB";
    if (src.includes("al jazeera")) return "#0A1628";
    if (src.includes("npr")) return "#475569";
    return colors.textSecondary;
  };

  const filteredTimeline = timeline.filter((cluster) => {
    const matchesSource = selectedSource === "All" || cluster.sources?.includes(selectedSource);
    const matchesCategory = selectedCategory === "All" || getCategory(cluster.label) === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      cluster.label.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesCategory && matchesSearch;
  });

  const totalArticles = timeline.reduce((acc, curr) => acc + curr.sizeMetric, 0);

  const chartData = filteredTimeline.map((cluster) => ({
    name: cluster.label.length > 20 ? cluster.label.substring(0, 20) + '...' : cluster.label,
    articles: cluster.sizeMetric,
    startDate: new Date(cluster.startDate).getTime(),
    endDate: new Date(cluster.endDate).getTime(),
    id: cluster.id,
    label: cluster.label,
  }));

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: colors.background,
        fontFamily: "'Georgia', serif",
        color: colors.textSecondary
      }}>
        Loading stories...
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: colors.background, 
      minHeight: '100vh',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      color: colors.text
    }}>
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 20px',
          background: toast.type === 'success' ? colors.primary : colors.secondary,
          color: '#fff',
          borderRadius: '3px',
          fontSize: '14px',
          zIndex: 999,
          fontFamily: "'Georgia', serif"
        }}>
          {toast.message}
        </div>
      )}

      {/* ===== HEADER ===== */}
      <header style={{ 
        backgroundColor: colors.white, 
        borderBottom: `3px solid ${colors.secondary}`,
        padding: '16px 24px'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            paddingBottom: '12px'
          }}>
            <h1 style={{ 
              fontSize: '38px', 
              fontWeight: 'bold',
              letterSpacing: '-1px',
              fontFamily: "'Georgia', serif",
              margin: 0,
              color: colors.primary,
              fontStyle: 'italic'
            }}>
              News<span style={{ color: colors.secondary }}>Pulse</span>
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Auto-refresh indicator */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontSize: '12px',
                color: colors.textLight,
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>
                <span 
                  style={{ 
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: autoRefresh ? '#22C55E' : '#94A3B8',
                    animation: autoRefresh ? 'pulse 1s ease-in-out infinite' : 'none'
                  }}
                />
                {autoRefresh ? `Auto-refresh in ${countdown}s` : 'Paused'}
              </div>
              
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  background: autoRefresh ? colors.secondary : colors.border,
                  color: autoRefresh ? '#fff' : colors.textSecondary,
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}
              >
                {autoRefresh ? '⏸' : '▶'}
              </button>

              <span style={{ 
                fontSize: '12px', 
                color: colors.textLight,
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
              <button 
                onClick={triggerRefresh}
                disabled={isRefreshing}
                style={{ 
                  padding: '6px 16px',
                  fontSize: '13px',
                  background: colors.secondary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontFamily: "'Georgia', serif"
                }}
              >
                {isRefreshing ? '...' : 'Refresh'}
              </button>
            </div>
          </div>
          
          {/* Navigation */}
          <div style={{ 
            display: 'flex', 
            gap: '24px', 
            paddingTop: '10px',
            fontSize: '13px',
            overflowX: 'auto'
          }}>
            {categories.map((cat) => (
              <span 
                key={cat}
                style={{ 
                  cursor: 'pointer',
                  color: selectedCategory === cat ? colors.secondary : colors.textSecondary,
                  fontWeight: selectedCategory === cat ? 'bold' : 'normal',
                  whiteSpace: 'nowrap',
                  paddingBottom: '4px',
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        
        {/* Search */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            placeholder="Search stories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: 'none',
              borderBottom: `2px solid ${colors.border}`,
              fontSize: '16px',
              background: 'transparent',
              outline: 'none',
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              color: colors.text
            }}
          />
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <button
            onClick={() => setTimelineView("list")}
            style={{
              padding: '4px 0',
              fontSize: '13px',
              background: 'transparent',
              color: timelineView === "list" ? colors.secondary : colors.textLight,
              border: 'none',
              borderBottom: timelineView === "list" ? `2px solid ${colors.secondary}` : 'none',
              cursor: 'pointer',
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontWeight: timelineView === "list" ? 'bold' : 'normal'
            }}
          >
            List
          </button>
          <button
            onClick={() => setTimelineView("chart")}
            style={{
              padding: '4px 0',
              fontSize: '13px',
              background: 'transparent',
              color: timelineView === "chart" ? colors.secondary : colors.textLight,
              border: 'none',
              borderBottom: timelineView === "chart" ? `2px solid ${colors.secondary}` : 'none',
              cursor: 'pointer',
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontWeight: timelineView === "chart" ? 'bold' : 'normal'
            }}
          >
            Timeline
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '32px' }}>
          
          {/* ===== MAIN COLUMN ===== */}
          <div>
            {/* Chart View */}
            {timelineView === "chart" && chartData.length > 0 && (
              <div style={{ 
                background: colors.white, 
                padding: '16px',
                marginBottom: '24px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{ 
                  fontSize: '15px', 
                  fontWeight: 'bold', 
                  marginBottom: '12px', 
                  color: colors.primary,
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}>
                  Story Timeline
                </h3>
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                      <XAxis 
                        dataKey="name" 
                        angle={-45}
                        textAnchor="end"
                        height={70}
                        interval={0}
                        tick={{ fontSize: 9, fill: colors.textLight, fontFamily: "'Georgia', serif" }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: colors.textLight, fontFamily: "'Georgia', serif" }} />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div style={{ 
                                background: colors.white, 
                                padding: '12px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                fontSize: '13px',
                                fontFamily: "'Georgia', serif"
                              }}>
                                <div style={{ fontWeight: 'bold', color: colors.primary }}>{data.label}</div>
                                <div style={{ color: colors.textSecondary }}>{data.articles} articles</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="articles" 
                        onClick={(data) => setActiveCluster(data.id)}
                        cursor="pointer"
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.articles > 8 ? colors.secondary : colors.accent}
                            fillOpacity={entry.articles > 8 ? 1 : 0.6}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ 
                  fontSize: '10px', 
                  color: colors.textLight, 
                  textAlign: 'center', 
                  marginTop: '8px',
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}>
                  Click bars to view details
                </p>
              </div>
            )}

            {/* Featured Story */}
            {filteredTimeline.length > 0 && timelineView === "list" && (
              <div 
                style={{ 
                  paddingBottom: '16px',
                  marginBottom: '20px',
                  cursor: 'pointer',
                  borderBottom: `2px solid ${colors.secondary}`
                }}
                onClick={() => setActiveCluster(filteredTimeline[0].id)}
              >
                <div style={{ 
                  fontSize: '11px', 
                  color: colors.secondary, 
                  textTransform: 'uppercase', 
                  fontWeight: 'bold', 
                  marginBottom: '4px',
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '1px'
                }}>
                  ★ Featured
                </div>
                <h2 style={{ 
                  fontSize: '28px', 
                  fontWeight: 'bold',
                  lineHeight: '1.2',
                  fontFamily: "'Georgia', serif",
                  margin: 0,
                  color: colors.primary,
                  fontStyle: 'italic'
                }}>
                  {filteredTimeline[0].label}
                </h2>
                <div style={{ 
                  fontSize: '13px', 
                  color: colors.textSecondary, 
                  marginTop: '6px',
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}>
                  {filteredTimeline[0].sizeMetric} articles · {filteredTimeline[0].sources?.slice(0, 3).join(', ')}
                </div>
                <div style={{ marginTop: '6px' }}>
                  <span style={{ 
                    fontSize: '11px', 
                    background: colors.accentLight, 
                    padding: '2px 10px',
                    color: colors.secondary,
                    fontFamily: "'Georgia', serif",
                    fontStyle: 'italic',
                    fontWeight: 'bold'
                  }}>
                    {getCategory(filteredTimeline[0].label)}
                  </span>
                </div>
              </div>
            )}

            {/* Story List */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              maxHeight: '500px',
              overflowY: 'auto',
              paddingRight: '8px'
            }}>
              {filteredTimeline.slice(1).map((cluster) => {
                const isActive = activeCluster === cluster.id;
                
                return (
                  <div
                    key={cluster.id}
                    onClick={() => setActiveCluster(cluster.id)}
                    style={{
                      padding: '14px 0',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${colors.border}`,
                      paddingLeft: isActive ? '12px' : '0',
                      borderLeft: isActive ? `4px solid ${colors.secondary}` : '4px solid transparent',
                      backgroundColor: isActive ? colors.accentLight : 'transparent',
                      borderRadius: isActive ? '0 4px 4px 0' : '0'
                    }}
                  >
                    <div style={{ 
                      fontSize: '12px', 
                      color: colors.textLight,
                      fontFamily: "'Georgia', serif",
                      fontStyle: 'italic'
                    }}>
                      {cluster.sources?.[0] || 'News'} · {new Date(cluster.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {cluster.sizeMetric} articles
                    </div>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: 'bold',
                      marginTop: '2px',
                      fontFamily: "'Georgia', serif",
                      color: isActive ? colors.secondary : colors.primary,
                      fontStyle: 'italic',
                      lineHeight: '1.3'
                    }}>
                      {cluster.label}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <span style={{ 
                        fontSize: '11px', 
                        color: colors.textLight,
                        fontFamily: "'Georgia', serif",
                        fontStyle: 'italic'
                      }}>
                        {getCategory(cluster.label)}
                      </span>
                      {cluster.sizeMetric > 8 && (
                        <span style={{ 
                          fontSize: '11px', 
                          color: colors.secondary, 
                          fontWeight: 'bold',
                          fontFamily: "'Georgia', serif"
                        }}>● Trending</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredTimeline.slice(1).length === 0 && (
                <div style={{ 
                  color: colors.textLight, 
                  textAlign: 'center', 
                  padding: '40px 0',
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}>
                  No more stories
                </div>
              )}
            </div>
          </div>

          {/* ===== SIDEBAR ===== */}
          <div>
            {/* Stats */}
            <div style={{ 
              padding: '16px',
              marginBottom: '16px',
              background: colors.white,
              borderRadius: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ 
                fontSize: '11px', 
                color: colors.textLight, 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px',
                fontFamily: "'Georgia', serif"
              }}>Today</div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: colors.secondary,
                fontFamily: "'Georgia', serif"
              }}>{totalArticles}</div>
              <div style={{ 
                fontSize: '13px', 
                color: colors.textSecondary,
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>articles</div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                marginTop: '8px', 
                color: colors.secondary,
                fontFamily: "'Georgia', serif"
              }}>{timeline.length}</div>
              <div style={{ 
                fontSize: '13px', 
                color: colors.textSecondary,
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>stories</div>
            </div>

            {/* Source filter */}
            <div style={{ 
              padding: '16px',
              marginBottom: '16px',
              background: colors.white,
              borderRadius: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ 
                fontSize: '11px', 
                color: colors.textLight, 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px', 
                marginBottom: '10px',
                fontFamily: "'Georgia', serif"
              }}>
                Sources
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontSize: '13px', 
                  cursor: 'pointer', 
                  color: colors.text,
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic'
                }}>
                  <input
                    type="radio"
                    checked={selectedSource === "All"}
                    onChange={() => setSelectedSource("All")}
                    style={{ accentColor: colors.secondary }}
                  />
                  All sources
                </label>
                {sources.map((src) => (
                  <label key={src} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    fontSize: '13px', 
                    cursor: 'pointer', 
                    color: colors.text,
                    fontFamily: "'Georgia', serif",
                    fontStyle: 'italic'
                  }}>
                    <input
                      type="radio"
                      checked={selectedSource === src}
                      onChange={() => setSelectedSource(src)}
                      style={{ accentColor: colors.secondary }}
                    />
                    {src}
                  </label>
                ))}
              </div>
            </div>

            {/* Shortcuts */}
            <div style={{ 
              padding: '12px 16px',
              fontSize: '12px',
              color: colors.textLight,
              background: colors.white,
              borderRadius: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⌘R refresh · Esc close</span>
                <span style={{ 
                  fontSize: '10px',
                  color: autoRefresh ? '#22C55E' : colors.textLight,
                  fontWeight: 'bold'
                }}>
                  {autoRefresh ? '● Live' : '○ Paused'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== STORY DETAIL PANEL ===== */}
        {activeCluster && clusterDetails && (
          <div style={{
            position: 'fixed',
            top: '0',
            right: '0',
            width: '420px',
            height: '100%',
            background: colors.white,
            boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
            zIndex: '100',
            overflowY: 'auto',
            padding: '32px',
            fontFamily: "'Georgia', 'Times New Roman', serif"
          }}>
            <button 
              onClick={() => { setActiveCluster(null); setClusterDetails(null); }}
              style={{
                float: 'right',
                background: 'none',
                border: 'none',
                fontSize: '28px',
                cursor: 'pointer',
                color: colors.textLight,
                fontFamily: "'Georgia', serif"
              }}
            >
              ×
            </button>

            <div style={{ marginTop: '20px' }}>
              <div style={{ 
                fontSize: '11px', 
                color: colors.secondary, 
                textTransform: 'uppercase', 
                fontWeight: 'bold', 
                letterSpacing: '0.5px',
                fontFamily: "'Georgia', serif"
              }}>
                Coverage
              </div>
              <h2 style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                lineHeight: '1.3',
                marginTop: '6px',
                color: colors.primary,
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>
                {timeline.find(c => c.id === activeCluster)?.label || ''}
              </h2>
              <div style={{ 
                fontSize: '13px', 
                color: colors.textSecondary, 
                marginTop: '8px',
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic'
              }}>
                {clusterDetails.articles?.length || 0} articles
              </div>

              <div style={{ 
                marginTop: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                maxHeight: '500px',
                overflowY: 'auto',
                paddingRight: '8px'
              }}>
                {(clusterDetails.articles || []).map((article, idx) => (
                  <a
                    key={idx}
                    href={article.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '14px',
                      borderBottom: `1px solid ${colors.border}`,
                      textDecoration: 'none',
                      color: colors.text,
                      fontFamily: "'Georgia', serif",
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = colors.secondary}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = colors.border}
                  >
                    <div style={{ 
                      fontSize: '11px', 
                      color: colors.textLight,
                      fontStyle: 'italic'
                    }}>
                      {article.source} · {article.published_at ? new Date(article.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                    <div style={{ 
                      fontSize: '15px', 
                      marginTop: '4px', 
                      color: colors.primary,
                      fontStyle: 'italic',
                      fontWeight: 'bold'
                    }}>
                      {article.title}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===== FOOTER ===== */}
      <footer style={{
        padding: '16px 24px',
        background: colors.white,
        marginTop: '32px',
        fontSize: '12px',
        color: colors.textLight,
        borderTop: `1px solid ${colors.border}`
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ 
            color: colors.primary,
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontWeight: 'bold'
          }}>NewsPulse</span>
          <span style={{ 
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span>{sources.length} sources</span>
            <span style={{ 
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: autoRefresh ? '#22C55E' : '#94A3B8',
              animation: autoRefresh ? 'pulse 1s ease-in-out infinite' : 'none'
            }} />
            <span style={{ 
              color: autoRefresh ? '#22C55E' : colors.textLight,
              fontWeight: autoRefresh ? 'bold' : 'normal'
            }}>
              {autoRefresh ? 'Live' : 'Paused'}
            </span>
          </span>
        </div>
      </footer>

      {/* ===== STYLES ===== */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Georgia&display=swap');
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb {
          background: #c0c0c0;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #a0a0a0;
        }
        
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          font-family: 'Georgia', 'Times New Roman', serif;
        }
      `}</style>
    </div>
  );
}