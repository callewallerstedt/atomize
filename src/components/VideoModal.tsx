"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import GlowSpinner from "@/components/GlowSpinner";
import { loadSubjectData, saveSubjectDataAsync, type StoredSubjectData, type LessonVideo } from "@/utils/storage";

type Video = LessonVideo;

interface VideoModalProps {
  open: boolean;
  onClose: () => void;
  lessonTitle: string;
  lessonSummary?: string;
  lessonBody?: string;
  courseName?: string;
  courseContext?: string;
  slug?: string;
  nodeName?: string;
  lessonIndex?: number;
  onVideosSaved?: () => void;
}

export default function VideoModal({
  open,
  onClose,
  lessonTitle,
  lessonSummary,
  lessonBody,
  courseName,
  courseContext,
  slug,
  nodeName,
  lessonIndex,
  onVideosSaved,
}: VideoModalProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>('Free');

  // Load saved videos when modal opens
  useEffect(() => {
    if (open) {
      const saved = loadSavedVideos();
      // Only fetch if no saved videos were found
      if (!saved && !loading) {
        fetchVideos();
      }
    }
  }, [open]);

  function loadSavedVideos(): boolean {
    if (!slug || !nodeName || lessonIndex === undefined) return false;
    
    try {
      const subjectData = loadSubjectData(slug) as StoredSubjectData | null;
      if (!subjectData?.nodes?.[nodeName]) return false;
      
      const nodeContent = subjectData.nodes[nodeName] as any;
      if (nodeContent?.lessons?.[lessonIndex]?.videos) {
        const savedVideos = nodeContent.lessons[lessonIndex].videos as LessonVideo[];
        const savedQueries = nodeContent.lessons[lessonIndex].videosQueries as string[] | undefined;
        
        if (savedVideos && savedVideos.length > 0) {
          setVideos(savedVideos);
          if (savedQueries) {
            setSearchQueries(savedQueries);
          }
          return true; // Found saved videos
        }
      }
    } catch (error) {
      console.error('Failed to load saved videos:', error);
    }
    return false; // No saved videos found
  }

  async function saveVideosToLesson(videosToSave: Video[], queriesToSave: string[]) {
    if (!slug || !nodeName || lessonIndex === undefined) return;
    
    try {
      const subjectData = loadSubjectData(slug) as StoredSubjectData | null;
      if (!subjectData) return;
      
      if (!subjectData.nodes) {
        subjectData.nodes = {};
      }
      
      const nodeContent = subjectData.nodes[nodeName] as any;
      if (!nodeContent || !nodeContent.lessons) return;
      
      if (!nodeContent.lessons[lessonIndex]) {
        nodeContent.lessons[lessonIndex] = {};
      }
      
      // Save videos and queries
      nodeContent.lessons[lessonIndex].videos = videosToSave;
      nodeContent.lessons[lessonIndex].videosQueries = queriesToSave;
      nodeContent.lessons[lessonIndex].videosFetchedAt = Date.now();
      
      subjectData.nodes[nodeName] = nodeContent;
      
      await saveSubjectDataAsync(slug, subjectData);
      
      if (onVideosSaved) {
        onVideosSaved();
      }
    } catch (error) {
      console.error('Failed to save videos:', error);
    }
  }

  // Reset when closed
  useEffect(() => {
    if (!open) {
      // Small delay to allow modal close animation
      const timeout = setTimeout(() => {
        setSelectedVideo(null);
        setSearchQueries([]);
        setSubscriptionLevel('Free');
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  async function fetchVideos() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/find-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle,
          lessonSummary,
          lessonBody,
          courseName,
          courseContext,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to find videos");
      }

      const fetchedVideos = data.videos || [];
      const fetchedQueries = data.queries || [];
      
      setVideos(fetchedVideos);
      setSearchQueries(fetchedQueries);
      setSubscriptionLevel(data.subscriptionLevel || 'Free');
      
      // Save videos to lesson
      if (fetchedVideos.length > 0) {
        await saveVideosToLesson(fetchedVideos, fetchedQueries);
      }
      
      // Don't auto-select - let user pick a video
    } catch (err: any) {
      setError(err?.message || "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedVideo(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Videos"
      className="!max-w-4xl"
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <GlowSpinner size={56} ariaLabel="Searching for videos" idSuffix="video-search" />
            <p className="mt-4 text-sm text-[var(--foreground)]/60">
              Searching for educational videos...
            </p>
            <p className="text-xs text-[var(--foreground)]/40 mt-1">
              This may take a moment
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <div className="text-red-400 text-sm mb-3">{error}</div>
            <button
              onClick={fetchVideos}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && videos.length > 0 && (
          <>
            {/* Show search queries for Tester tier users */}
            {subscriptionLevel === 'Tester' && searchQueries.length > 0 && (
              <div className="rounded-lg border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 p-3 mb-4">
                <p className="text-xs font-medium text-[var(--accent-cyan)] mb-2 uppercase tracking-wide">
                  🔍 AI Search Queries Used:
                </p>
                <div className="flex flex-wrap gap-2">
                  {searchQueries.map((query, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1 rounded-md bg-[var(--background)]/50 border border-[var(--foreground)]/10 text-xs text-[var(--foreground)]/70"
                    >
                      {query}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Video Player - only show when a video is selected */}
            {selectedVideo && (
              <>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedVideo.videoId}?rel=0&modestbranding=1`}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>

                {/* Selected Video Info */}
                <div className="px-1">
                  <h3 className="font-semibold text-[var(--foreground)] line-clamp-2">
                    {selectedVideo.title}
                  </h3>
                  <p className="text-xs text-[var(--accent-cyan)] mt-1">
                    {selectedVideo.channel}
                  </p>
                  {selectedVideo.description && (
                    <p className="text-sm text-[var(--foreground)]/60 mt-2 line-clamp-2">
                      {selectedVideo.description}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Video Thumbnails */}
            <div className={selectedVideo ? "border-t border-[var(--foreground)]/10 pt-4" : ""}>
              <p className="text-xs font-medium text-[var(--foreground)]/50 uppercase tracking-wide mb-3">
                {selectedVideo ? `More Videos (${videos.length})` : `Select a Video (${videos.length})`}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {videos.map((video) => (
                  <button
                    key={video.videoId}
                    onClick={() => setSelectedVideo(video)}
                    className={`group relative rounded-lg overflow-hidden transition-all ${
                      selectedVideo?.videoId === video.videoId
                        ? "ring-2 ring-[var(--accent-cyan)] ring-offset-2 ring-offset-[var(--background)]"
                        : "hover:ring-2 hover:ring-[var(--foreground)]/30"
                    }`}
                  >
                    <div className="aspect-video bg-[var(--foreground)]/5 relative">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback for broken thumbnails
                          (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
                        }}
                      />
                      {/* Duration badge */}
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-medium text-white">
                          {video.duration}
                        </div>
                      )}
                      {/* Play icon overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-cyan)] flex items-center justify-center">
                          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      {/* Currently playing indicator */}
                      {selectedVideo?.videoId === video.videoId && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[var(--accent-cyan)] text-[10px] font-bold text-white">
                          NOW PLAYING
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-left">
                      <p className="text-xs font-medium text-[var(--foreground)] line-clamp-2 leading-tight">
                        {video.title}
                      </p>
                      <p className="text-[10px] text-[var(--foreground)]/50 mt-1 truncate">
                        {video.channel}
                      </p>
                      {/* Views count */}
                      {video.viewsFormatted && (
                        <p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">
                          {video.viewsFormatted}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* External link */}
            {selectedVideo && (
              <div className="flex justify-center pt-2">
                <a
                  href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]/50 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open in YouTube
                </a>
              </div>
            )}
          </>
        )}

        {!loading && !error && videos.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[var(--foreground)]/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[var(--foreground)]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-sm text-[var(--foreground)]/60">
              No videos found for this topic.
            </p>
            <button
              onClick={fetchVideos}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search Again
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

