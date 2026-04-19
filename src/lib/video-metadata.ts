// Fetches lightweight metadata (title, duration) for a video link.
// YouTube's oEmbed endpoint does NOT support CORS, so we route through our
// own edge function (which works for Vimeo too). Loom/Drive/direct files
// don't expose public metadata we can rely on.

import { parseVideoUrl, type ParsedEmbed } from "./video-embed";
import { supabase } from "@/integrations/supabase/client";

export interface VideoMetadata {
  title: string | null;
  durationSeconds: number | null;
  provider: ParsedEmbed["provider"];
}

export async function fetchVideoMetadata(rawUrl: string): Promise<VideoMetadata | null> {
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed) return null;

  // Only YouTube + Vimeo expose useful metadata.
  if (parsed.provider !== "youtube" && parsed.provider !== "vimeo") {
    return { title: null, durationSeconds: null, provider: parsed.provider };
  }

  try {
    const { data, error } = await supabase.functions.invoke("video-oembed", {
      body: { url: parsed.originalUrl },
    });
    if (error || !data) {
      console.warn("[video-metadata] edge function error:", error);
      return { title: null, durationSeconds: null, provider: parsed.provider };
    }
    const d = data as { title?: string | null; durationSeconds?: number | null };
    return {
      title: d.title ?? null,
      durationSeconds: d.durationSeconds ?? null,
      provider: parsed.provider,
    };
  } catch (err) {
    console.warn("[video-metadata] fetch failed:", err);
    return { title: null, durationSeconds: null, provider: parsed.provider };
  }
}
