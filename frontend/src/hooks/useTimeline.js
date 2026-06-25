"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export function useTimeline(activeSources) {
  const [timeline, setTimeline] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const refresh = useCallback(async (srcs) => {
    try {
      setLoading(true);
      setError(null);
      
      const [tl, src] = await Promise.all([
        api.getTimeline(srcs?.length ? srcs : undefined),
        api.getSources(),
      ]);
      
      setTimeline(tl || []);
      setSources(src || []);
      setLastRefreshed(new Date().toISOString());
    } catch (e) {
      setError(e.message || 'Failed to fetch data');
      console.error('Refresh error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh(activeSources);
  }, []); // Run once on mount

  // Refresh when sources change
  useEffect(() => {
    if (!loading) {
      refresh(activeSources);
    }
  }, [activeSources.join(',')]);

  // Poll for job status
  useEffect(() => {
    if (!jobId || !jobStatus || jobStatus === 'completed' || jobStatus === 'failed') {
      return;
    }
    
    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 60; // 2 minutes max
    
    const timer = setInterval(async () => {
      pollCount++;
      
      try {
        const status = await api.getIngestStatus(jobId);
        if (!isMounted) return;
        
        setJobStatus(status.status);
        
        if (status.status === 'completed' || status.status === 'failed') {
          setJobId(null);
          // Refresh data after job completes
          refresh(activeSources);
          clearInterval(timer);
        } else if (pollCount >= maxPolls) {
          // Timeout after 2 minutes
          setJobStatus('timeout');
          setJobId(null);
          clearInterval(timer);
        }
      } catch (err) {
        console.error('Status poll error:', err);
        if (pollCount >= maxPolls) {
          setJobStatus('timeout');
          setJobId(null);
          clearInterval(timer);
        }
      }
    }, 2000);
    
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [jobId, jobStatus, activeSources, refresh]);

  const triggerRefresh = async () => {
    try {
      setError(null);
      const { jobId: id } = await api.triggerIngest();
      setJobId(id);
      setJobStatus('running');
    } catch (e) {
      setError(e.message || 'Failed to trigger refresh');
      console.error('Trigger refresh error:', e);
    }
  };

  return {
    timeline,
    sources,
    loading,
    error,
    jobStatus,
    lastRefreshed,
    triggerRefresh,
    refresh,
  };
}