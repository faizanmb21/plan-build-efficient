// Shared helpers for the Projects module.
import { supabase } from "@/integrations/supabase/client";

export type ProjectSubmissionStatus = "pending" | "approved" | "revision";
export type MemberProjectStatus =
  | "not_submitted"
  | "pending"
  | "approved"
  | "revision";

export function projectStatusLabel(s: MemberProjectStatus): string {
  switch (s) {
    case "not_submitted":
      return "Not submitted";
    case "pending":
      return "Pending review";
    case "approved":
      return "Graded";
    case "revision":
      return "Needs revision";
  }
}

export function projectStatusBadgeClass(s: MemberProjectStatus): string {
  switch (s) {
    case "not_submitted":
      return "bg-white/5 text-muted-foreground border-white/10";
    case "pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "approved":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "revision":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
}

/**
 * Upload a project submission file to the private `submissions` bucket.
 * Returns the storage path (which is what we save into project_submissions.file_url).
 */
export async function uploadProjectFile(
  userId: string,
  projectId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  // Storage RLS requires the first folder to be the user's UUID.
  const path = `${userId}/projects/${projectId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("submissions")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Get a short-lived signed URL for an existing submission file. */
export async function getSignedSubmissionUrl(
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("submissions")
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
