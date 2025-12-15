"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Course = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

type ExamSnipe = {
  id: string;
  courseName: string;
  slug: string;
  subjectSlug: string | null;
  fileNames: any;
  createdAt: string;
};

type Lesson = {
  id: string;
  courseSlug: string;
  courseName: string;
  topicName: string;
  lessonTitle: string;
  createdAt?: string;
};

type SubjectData = {
  id: string;
  slug: string;
  updatedAt: string;
  hasSurgeLogs?: boolean;
  surgeLogCount?: number;
  hasPracticeLogs?: boolean;
  practiceLogCount?: number;
  hasReviewSchedules?: boolean;
  reviewScheduleCount?: number;
  hasFiles?: boolean;
  fileCount?: number;
};

type DataResponse = {
  ok: boolean;
  data?: {
    courses: Course[];
    examSnipes: ExamSnipe[];
    lessons: Lesson[];
    subjectData: SubjectData[];
  };
  error?: string;
};

export default function DataManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingAllCourses, setDeletingAllCourses] = useState(false);
  const [deletingAllExamSnipes, setDeletingAllExamSnipes] = useState(false);
  const [deletingAllSubjectData, setDeletingAllSubjectData] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/data", { credentials: "include" });
      const json: DataResponse = await res.json();
      
      if (!json.ok) {
        setError(json.error || "Failed to load data");
        if (res.status === 403) {
          router.push("/");
        }
        return;
      }
      
      setData(json.data || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const deleteCourse = async (slug: string) => {
    if (!confirm(`Delete course "${slug}" and ALL associated data (lessons, exam snipes, surge logs, practice logs)?`)) {
      return;
    }

    setDeleting((prev) => new Set(prev).add(`course-${slug}`));

    try {
      // Delete from server
      const res = await fetch(`/api/subjects?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete course from server");
      }

      // Delete from localStorage
      try {
        localStorage.removeItem(`atomicSubjectData:${slug}`);
        localStorage.removeItem(`atomicPracticeLog:${slug}`);
        
        // Remove from subjects list
        const subjects = JSON.parse(localStorage.getItem("atomicSubjects") || "[]");
        const filtered = subjects.filter((s: any) => s.slug !== slug);
        localStorage.setItem("atomicSubjects", JSON.stringify(filtered));
      } catch (err) {
        console.warn("Failed to delete from localStorage:", err);
      }

      await loadData();
    } catch (err: any) {
      alert(`Failed to delete course: ${err?.message}`);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(`course-${slug}`);
        return next;
      });
    }
  };

  const deleteExamSnipe = async (slug: string) => {
    if (!confirm(`Delete exam snipe "${slug}"?`)) {
      return;
    }

    setDeleting((prev) => new Set(prev).add(`exam-${slug}`));

    try {
      const res = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete exam snipe");
      }

      await loadData();
    } catch (err: any) {
      alert(`Failed to delete exam snipe: ${err?.message}`);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(`exam-${slug}`);
        return next;
      });
    }
  };

  const deleteSubjectData = async (slug: string) => {
    if (!confirm(`Delete all subject data for "${slug}"?`)) {
      return;
    }

    setDeleting((prev) => new Set(prev).add(`data-${slug}`));

    try {
      const res = await fetch(`/api/subjects/data?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete subject data");
      }

      // Also delete from localStorage
      try {
        localStorage.removeItem(`atomicSubjectData:${slug}`);
        localStorage.removeItem(`atomicPracticeLog:${slug}`);
      } catch (err) {
        console.warn("Failed to delete from localStorage:", err);
      }

      await loadData();
    } catch (err: any) {
      alert(`Failed to delete subject data: ${err?.message}`);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(`data-${slug}`);
        return next;
      });
    }
  };

  const deleteAllCourses = async () => {
    if (!data || data.courses.length === 0) return;

    const confirmMessage = `⚠️ DANGER: This will PERMANENTLY DELETE ALL ${data.courses.length} courses and ALL associated data (lessons, exam snipes, surge logs, practice logs).\n\nThis action CANNOT be undone. Type "DELETE ALL COURSES" to confirm:`;

    const userInput = prompt(confirmMessage);
    if (userInput !== "DELETE ALL COURSES") {
      return;
    }

    setDeletingAllCourses(true);

    try {
      const courseDeletePromises = data.courses.map((course) =>
        fetch(`/api/subjects?slug=${encodeURIComponent(course.slug)}`, {
          method: "DELETE",
          credentials: "include",
        }).catch((err) => {
          console.error(`Failed to delete course ${course.slug}:`, err);
          return { ok: false };
        })
      );

      await Promise.all(courseDeletePromises);

      // Clean up localStorage
      try {
        data.courses.forEach((course) => {
          try {
            localStorage.removeItem(`atomicSubjectData:${course.slug}`);
            localStorage.removeItem(`atomicPracticeLog:${course.slug}`);
          } catch (err) {
            console.warn(`Failed to remove localStorage for ${course.slug}:`, err);
          }
        });

        // Update subjects list
        const subjects = JSON.parse(localStorage.getItem("atomicSubjects") || "[]");
        const filtered = subjects.filter((s: any) => !data.courses.some((c) => c.slug === s.slug));
        localStorage.setItem("atomicSubjects", JSON.stringify(filtered));
      } catch (err) {
        console.warn("Failed to clean up localStorage:", err);
      }

      await loadData();
      alert("All courses have been deleted successfully.");
    } catch (err: any) {
      alert(`Failed to delete all courses: ${err?.message}`);
    } finally {
      setDeletingAllCourses(false);
    }
  };

  const deleteAllExamSnipes = async () => {
    if (!data || data.examSnipes.length === 0) return;

    const confirmMessage = `⚠️ DANGER: This will PERMANENTLY DELETE ALL ${data.examSnipes.length} exam snipes.\n\nThis action CANNOT be undone. Type "DELETE ALL EXAM SNIPES" to confirm:`;

    const userInput = prompt(confirmMessage);
    if (userInput !== "DELETE ALL EXAM SNIPES") {
      return;
    }

    setDeletingAllExamSnipes(true);

    try {
      const examDeletePromises = data.examSnipes.map((exam) =>
        fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(exam.slug)}`, {
          method: "DELETE",
          credentials: "include",
        }).catch((err) => {
          console.error(`Failed to delete exam snipe ${exam.slug}:`, err);
          return { ok: false };
        })
      );

      await Promise.all(examDeletePromises);
      await loadData();
      alert("All exam snipes have been deleted successfully.");
    } catch (err: any) {
      alert(`Failed to delete all exam snipes: ${err?.message}`);
    } finally {
      setDeletingAllExamSnipes(false);
    }
  };

  const deleteAllSubjectData = async () => {
    if (!data || data.subjectData.length === 0) return;

    const confirmMessage = `⚠️ DANGER: This will PERMANENTLY DELETE ALL ${data.subjectData.length} subject data entries (lessons, topics, surge logs, practice logs).\n\nThis action CANNOT be undone. Type "DELETE ALL SUBJECT DATA" to confirm:`;

    const userInput = prompt(confirmMessage);
    if (userInput !== "DELETE ALL SUBJECT DATA") {
      return;
    }

    setDeletingAllSubjectData(true);

    try {
      const subjectDataDeletePromises = data.subjectData.map((sd) =>
        fetch(`/api/subjects/data?slug=${encodeURIComponent(sd.slug)}`, {
          method: "DELETE",
          credentials: "include",
        }).catch((err) => {
          console.error(`Failed to delete subject data ${sd.slug}:`, err);
          return { ok: false };
        })
      );

      await Promise.all(subjectDataDeletePromises);

      // Clean up localStorage
      try {
        data.subjectData.forEach((sd) => {
          try {
            localStorage.removeItem(`atomicSubjectData:${sd.slug}`);
            localStorage.removeItem(`atomicPracticeLog:${sd.slug}`);
          } catch (err) {
            console.warn(`Failed to remove localStorage for ${sd.slug}:`, err);
          }
        });
      } catch (err) {
        console.warn("Failed to clean up localStorage:", err);
      }

      await loadData();
      alert("All subject data has been deleted successfully.");
    } catch (err: any) {
      alert(`Failed to delete all subject data: ${err?.message}`);
    } finally {
      setDeletingAllSubjectData(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">Data Management</h1>
          <p className="text-[var(--foreground)]/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">Data Management</h1>
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">Data Management</h1>
          <p className="text-[var(--foreground)]/70">No data found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Data Management</h1>
          <p className="text-sm text-[var(--foreground)]/70">
            Manage all your courses, lessons, and exam snipes. Deleting a course will delete all associated data.
          </p>
        </div>

        {/* Courses */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Courses ({data.courses.length})
            </h2>
            {data.courses.length > 0 && (
              <button
                onClick={deleteAllCourses}
                disabled={deletingAllCourses}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {deletingAllCourses ? "Deleting..." : "Delete All Courses"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {data.courses.map((course) => (
              <div
                key={course.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50"
              >
                <div className="flex-1">
                  <div className="font-medium text-[var(--foreground)]">{course.name}</div>
                  <div className="text-sm text-[var(--foreground)]/60">
                    Slug: {course.slug} • Created: {new Date(course.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => deleteCourse(course.slug)}
                  disabled={deleting.has(`course-${course.slug}`)}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting.has(`course-${course.slug}`) ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
            {data.courses.length === 0 && (
              <p className="text-sm text-[var(--foreground)]/60">No courses found</p>
            )}
          </div>
        </section>

        {/* Exam Snipes */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Exam Snipes ({data.examSnipes.length})
            </h2>
            {data.examSnipes.length > 0 && (
              <button
                onClick={deleteAllExamSnipes}
                disabled={deletingAllExamSnipes}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {deletingAllExamSnipes ? "Deleting..." : "Delete All Exam Snipes"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {data.examSnipes.map((exam) => (
              <div
                key={exam.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50"
              >
                <div className="flex-1">
                  <div className="font-medium text-[var(--foreground)]">{exam.courseName}</div>
                  <div className="text-sm text-[var(--foreground)]/60">
                    Slug: {exam.slug} • Course: {exam.subjectSlug || "Unlinked"} • Created:{" "}
                    {new Date(exam.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => deleteExamSnipe(exam.slug)}
                  disabled={deleting.has(`exam-${exam.slug}`)}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting.has(`exam-${exam.slug}`) ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
            {data.examSnipes.length === 0 && (
              <p className="text-sm text-[var(--foreground)]/60">No exam snipes found</p>
            )}
          </div>
        </section>

        {/* Lessons */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Lessons ({data.lessons.length})
            </h2>
            {data.lessons.length > 0 && (
              <button
                onClick={deleteAllSubjectData}
                disabled={deletingAllSubjectData}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {deletingAllSubjectData ? "Deleting..." : "Delete All Lessons"}
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--foreground)]/60 mb-2">
            Note: Lessons are stored in subject data. Deleting all lessons will delete all subject data.
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50"
              >
                <div className="flex-1">
                  <div className="font-medium text-[var(--foreground)]">{lesson.lessonTitle}</div>
                  <div className="text-sm text-[var(--foreground)]/60">
                    Course: {lesson.courseName} • Topic: {lesson.topicName}
                  </div>
                </div>
              </div>
            ))}
            {data.lessons.length === 0 && (
              <p className="text-sm text-[var(--foreground)]/60">No lessons found</p>
            )}
          </div>
        </section>

        {/* Subject Data */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Subject Data ({data.subjectData.length})
            </h2>
            {data.subjectData.length > 0 && (
              <button
                onClick={deleteAllSubjectData}
                disabled={deletingAllSubjectData}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {deletingAllSubjectData ? "Deleting..." : "Delete All Subject Data"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {data.subjectData.map((sd) => (
              <div
                key={sd.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50"
              >
                <div className="flex-1">
                  <div className="font-medium text-[var(--foreground)]">{sd.slug}</div>
                  <div className="text-sm text-[var(--foreground)]/60">
                    Updated: {new Date(sd.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-[var(--foreground)]/50 mt-1 flex flex-wrap gap-2">
                    {sd.surgeLogCount !== undefined && sd.surgeLogCount > 0 && (
                      <span>Surge logs: {sd.surgeLogCount}</span>
                    )}
                    {sd.practiceLogCount !== undefined && sd.practiceLogCount > 0 && (
                      <span>Practice logs: {sd.practiceLogCount}</span>
                    )}
                    {sd.reviewScheduleCount !== undefined && sd.reviewScheduleCount > 0 && (
                      <span>Review schedules: {sd.reviewScheduleCount}</span>
                    )}
                    {sd.fileCount !== undefined && sd.fileCount > 0 && (
                      <span>Files: {sd.fileCount}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteSubjectData(sd.slug)}
                  disabled={deleting.has(`data-${sd.slug}`)}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting.has(`data-${sd.slug}`) ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
            {data.subjectData.length === 0 && (
              <p className="text-sm text-[var(--foreground)]/60">No subject data found</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

