"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import Modal from "@/components/Modal";
import type { StoredSubjectData } from "@/utils/storage";
import { saveSubjectDataAsync } from "@/utils/storage";
import { Suspense } from "react";
import dynamic from "next/dynamic";

// Dynamically import the home page to show it behind the modal
const HomePage = dynamic(() => import("@/app/page"), { ssr: false });

export default function SharePage() {
  const params = useParams<{ shareId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shareId = params?.shareId as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [courseData, setCourseData] = useState<{
    courseName: string;
    sharedBy: string;
    courseData: StoredSubjectData;
  } | null>(null);
  const autoSaveAttempted = useRef(false);

  const handleSave = async () => {
    if (!courseData) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/courses/share/${shareId}/save`, {
        method: "POST",
        credentials: "include",
      });
      
      const result = await response.json();
      
        if (!result.ok) {
          if (result.error === "Unauthorized") {
            alert("Please log in to save this course");
            router.push("/?redirect=share&shareId=" + shareId + "&autoSave=true");
            return;
          }
          setError(result.error || "Failed to save course");
          setSaving(false);
          return;
      }

      // Save the server-side imported copy locally (avoids re-uploading embedded exam snipes and keeps slug rewrites).
      let courseDataToSave: StoredSubjectData | null = null;
      try {
        const dataRes = await fetch(`/api/subject-data?slug=${encodeURIComponent(result.slug)}`, { credentials: "include" });
        const dataJson = await dataRes.json().catch(() => ({}));
        if (dataRes.ok && dataJson?.ok && dataJson.data) {
          courseDataToSave = dataJson.data as StoredSubjectData;
        }
      } catch {}

      if (!courseDataToSave) {
        const { examSnipes: _embeddedExamSnipes, ...rest } = courseData.courseData as any;
        courseDataToSave = {
          ...(rest as StoredSubjectData),
          subject: courseData.courseName,
          topics: courseData.courseData.topics || [],
        };
      } else {
        courseDataToSave = {
          ...courseDataToSave,
          subject: courseData.courseName,
          topics: courseDataToSave.topics || [],
        };
      }

      await saveSubjectDataAsync(result.slug, courseDataToSave);
      
      // Update subjects list
      if (typeof window !== "undefined") {
        const subjects = JSON.parse(localStorage.getItem("atomicSubjects") || "[]");
        const newSubject = { name: result.name, slug: result.slug };
        const updatedSubjects = [...subjects, newSubject];
        localStorage.setItem("atomicSubjects", JSON.stringify(updatedSubjects));
      }

      // Redirect to the course
      router.push(`/subjects/${result.slug}`);
    } catch (err: any) {
      console.error("Error saving course:", err);
      setError(err?.message || "Failed to save course");
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    async function fetchSharedCourse() {
      try {
        // Check authentication status
        const meResponse = await fetch("/api/me", { credentials: "include" });
        const meResult = await meResponse.json().catch(() => ({}));
        setIsAuthenticated(!!meResult?.user);

        const response = await fetch(`/api/courses/share/${shareId}`);
        const result = await response.json();
        
        if (!result.ok) {
          setError(result.error || "Failed to load shared course");
          setLoading(false);
          return;
        }

        setCourseData({
          courseName: result.course.courseName,
          sharedBy: result.course.sharedBy,
          courseData: result.course.courseData as StoredSubjectData,
        });
        setLoading(false);
      } catch (err: any) {
        console.error("Error fetching shared course:", err);
        setError(err?.message || "Failed to load shared course");
        setLoading(false);
      }
    }

    fetchSharedCourse();
  }, [shareId]);

  // Auto-save if autoSave parameter is present and user is authenticated
  useEffect(() => {
    if (
      searchParams.get("autoSave") === "true" && 
      isAuthenticated === true && 
      courseData && 
      !saving && 
      !loading &&
      !autoSaveAttempted.current
    ) {
      autoSaveAttempted.current = true;
      handleSave();
    }
  }, [searchParams, isAuthenticated, courseData, saving, loading, shareId]);

  const handleCancel = () => {
    router.push("/");
  };

  const handleLoginAndSave = () => {
    router.push("/?redirect=share&shareId=" + shareId + "&autoSave=true");
  };

  const handleJustView = () => {
    // Save course data to a temporary location for viewing
    if (!courseData) return;
    
    const tempSlug = `shared-${shareId}`;
    const courseDataToSave = {
      ...courseData.courseData,
      subject: courseData.courseName,
      topics: (courseData.courseData as any)?.topics || [],
    } as StoredSubjectData;

    saveSubjectDataAsync(tempSlug, courseDataToSave).then(() => {
      // Update subjects list temporarily
      if (typeof window !== "undefined") {
        const subjects = JSON.parse(localStorage.getItem("atomicSubjects") || "[]");
        const existingIndex = subjects.findIndex((s: any) => s.slug === tempSlug);
        const tempSubject = { name: courseData.courseName, slug: tempSlug };
        if (existingIndex >= 0) {
          subjects[existingIndex] = tempSubject;
        } else {
          subjects.push(tempSubject);
        }
        localStorage.setItem("atomicSubjects", JSON.stringify(subjects));
      }
      router.push(`/subjects/${tempSlug}`);
    });
  };

  // Render background - only show HomePage if authenticated, otherwise show simple background
  // For shared courses, users without premium (or not logged in) should not see AI features
  const renderBackground = () => {
    if (isAuthenticated === true) {
      // Pass hasPremiumAccess=false to disable AI features for shared course viewers
      // The HomePage component will handle this internally
      return <HomePage />;
    }
    // Simple background for unauthenticated users
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="container mx-auto px-6 pt-10 pb-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Atomic Studying</h1>
            <p className="text-[var(--foreground)]/70">View shared course</p>
            <p className="text-sm text-[var(--foreground)]/50 mt-2">AI features require Premium access</p>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <>
        {renderBackground()}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <GlowSpinner />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {renderBackground()}
        <Modal
          open={true}
          onClose={() => router.push("/")}
          title="Error"
          footer={
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-lg bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/20 transition-colors"
            >
              Go Home
            </button>
          }
        >
          <p className="text-[var(--foreground)]/70">{error}</p>
        </Modal>
      </>
    );
  }

  if (saving) {
    return (
      <>
        {renderBackground()}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <GlowSpinner />
        </div>
      </>
    );
  }

  if (!courseData) {
    return renderBackground();
  }

  // Show different options based on authentication status
  const showUnauthenticatedOptions = isAuthenticated === false;

  return (
    <>
      {renderBackground()}
      <Modal
        open={true}
        onClose={handleCancel}
        title={`${courseData.sharedBy} shared ${courseData.courseName}`}
        footer={
          showUnauthenticatedOptions ? (
            <div className="flex gap-4 justify-end">
              <button
                onClick={handleCancel}
                className="px-6 py-3 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJustView}
                className="px-6 py-3 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
              >
                Just View
              </button>
              <button
                onClick={handleLoginAndSave}
                className="px-6 py-3 rounded-lg bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/20 transition-colors"
              >
                Log in and Save
              </button>
            </div>
          ) : (
            <div className="flex gap-4 justify-end">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-6 py-3 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Not now
              </button>
              <button
                onClick={handleJustView}
                disabled={saving}
                className="px-6 py-3 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Just View
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 rounded-lg bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          )
        }
      >
        <p className="text-lg text-[var(--foreground)]/70">
          {showUnauthenticatedOptions
            ? "You're not logged in. Would you like to log in and save this course, or just view it?"
            : "Do you want to save this course?"}
        </p>
      </Modal>
    </>
  );
}
