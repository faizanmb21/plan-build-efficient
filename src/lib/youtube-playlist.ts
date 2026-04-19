// Client wrapper around the youtube-playlist edge function.
import { supabase } from "@/integrations/supabase/client";

export interface PlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  watchUrl: string;
  position: number;
}

export interface PlaylistFetchResult {
  playlistTitle: string | null;
  items: PlaylistVideo[];
}

export async function fetchYoutubePlaylist(
  playlistUrl: string,
): Promise<PlaylistFetchResult> {
  const { data, error } = await supabase.functions.invoke("youtube-playlist", {
    body: { playlistUrl },
  });
  if (error) {
    // edge function returned non-2xx — supabase-js wraps the body in error.context
    let msg = error.message;
    try {
      const ctxBody = await (error as any).context?.json?.();
      if (ctxBody?.error) msg = ctxBody.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (!data) throw new Error("Empty response from playlist fetcher.");
  if ((data as any).error) throw new Error((data as any).error);
  return data as PlaylistFetchResult;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
