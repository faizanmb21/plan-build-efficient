import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Subscribes the logged-in member to realtime updates on their own submissions.
 * Fires an in-app toast whenever a submission flips from `pending` to a graded
 * state (`approved` or `revision`), or when the letter_grade changes.
 */
export function useGradeNotifications(userId: string | undefined) {
  const seenRef = React.useRef<Map<string, string>>(new Map());

  React.useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    // Prime the cache with current statuses so we don't toast for already-graded
    // submissions on first connect.
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id, status, letter_grade")
        .eq("user_id", userId);
      if (cancelled || !data) return;
      for (const row of data) {
        seenRef.current.set(row.id, `${row.status}:${row.letter_grade ?? ""}`);
      }
    })();

    const channel = supabase
      .channel(`submissions-grade-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submissions",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            letter_grade: string | null;
            feedback: string | null;
            lesson_id: string;
          };
          const key = `${row.status}:${row.letter_grade ?? ""}`;
          const prev = seenRef.current.get(row.id);
          seenRef.current.set(row.id, key);

          // Only notify when the submission is now graded AND something changed
          if (prev === key) return;
          if (row.status !== "approved" && row.status !== "revision") return;

          // Fetch lesson + course info for a richer toast
          const { data: lesson } = await supabase
            .from("lessons")
            .select("title, section_id, sections(course_id, courses(title))")
            .eq("id", row.lesson_id)
            .maybeSingle();

          const lessonTitle = lesson?.title ?? "Your submission";
          const courseId =
            (lesson as any)?.sections?.course_id as string | undefined;
          const courseTitle =
            (lesson as any)?.sections?.courses?.title ?? "course";

          const passed = row.status === "approved";
          const grade = row.letter_grade ?? (passed ? "Passed" : "Redo");
          const description = row.feedback
            ? `${courseTitle} — ${row.feedback.slice(0, 140)}${row.feedback.length > 140 ? "…" : ""}`
            : courseTitle;

          const toastFn = passed ? toast.success : toast.warning;
          toastFn(
            passed
              ? `Graded ${grade} — ${lessonTitle}`
              : `Redo required (${grade}) — ${lessonTitle}`,
            {
              description,
              duration: 8000,
              action: courseId
                ? {
                    label: "Open",
                    onClick: () => {
                      window.location.href = `/member/courses/${courseId}`;
                    },
                  }
                : undefined,
            },
          );
        },
      )
      .subscribe();

    // Also watch project submissions for grade updates
    const projectSeen = new Map<string, string>();
    (async () => {
      const { data } = await supabase
        .from("project_submissions")
        .select("id, status, letter_grade")
        .eq("user_id", userId);
      if (cancelled || !data) return;
      for (const row of data) {
        projectSeen.set(row.id, `${row.status}:${row.letter_grade ?? ""}`);
      }
    })();

    const projectChannel = supabase
      .channel(`project-subs-grade-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "project_submissions",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            letter_grade: string | null;
            feedback: string | null;
            project_id: string;
          };
          const key = `${row.status}:${row.letter_grade ?? ""}`;
          const prev = projectSeen.get(row.id);
          projectSeen.set(row.id, key);
          if (prev === key) return;
          if (row.status !== "approved" && row.status !== "revision") return;

          const { data: project } = await supabase
            .from("projects")
            .select("title")
            .eq("id", row.project_id)
            .maybeSingle();

          const passed = row.status === "approved";
          const grade = row.letter_grade ?? (passed ? "Passed" : "Redo");
          const projectTitle = project?.title ?? "Your project";
          const description = row.feedback
            ? `${row.feedback.slice(0, 140)}${row.feedback.length > 140 ? "…" : ""}`
            : "Open Projects to see details";

          const toastFn = passed ? toast.success : toast.warning;
          toastFn(
            passed
              ? `Project graded ${grade} — ${projectTitle}`
              : `Redo required (${grade}) — ${projectTitle}`,
            {
              description,
              duration: 8000,
              action: {
                label: "Open",
                onClick: () => {
                  window.location.href = `/member/projects`;
                },
              },
            },
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      supabase.removeChannel(projectChannel);
    };
  }, [userId]);
}
