// Fetches lightweight metadata (title, duration) from public oEmbed endpoints.
// No API keys, CORS-enabled. Returns null fields when the provider doesn't expose them.

import { parseVideoUrl, type ParsedEmbed } from "./video-embed";

export interface VideoMetadata {
  title: string | null;
  durationSeconds: number | null;
  provider: ParsedEmbed["provider"];
}

export async function fetchVideoMetadata(rawUrl: string): Promise<VideoMetadata | null> {
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed) return null;

  try {
    if (parsed.provider === "youtube") {
      // YouTube oEmbed gives title + author but NOT duration.
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.originalUrl)}&format=json`,
      );
      if (!res.ok) return { title: null, durationSeconds: null, provider: "youtube" };
      const json = (await res.json()) as { title?: string };
      return {
        title: json.title?.trim() || null,
        durationSeconds: null,
        provider: "youtube",
      };
    }

    if (parsed.provider === "vimeo") {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.originalUrl)}`,
      );
      if (!res.ok) return { title: null, durationSeconds: null, provider: "vimeo" };
      const json = (await res.json()) as { title?: string; duration?: number };
      return {
        title: json.title?.trim() || null,
        durationSeconds: typeof json.duration === "number" ? json.duration : null,
        provider: "vimeo",
      };
    }

    // Loom, Drive, direct files — no public oEmbed we can rely on.
    return { title: null, durationSeconds: null, provider: parsed.provider };
  } catch {
    return { title: null, durationSeconds: null, provider: parsed.provider };
  }
}
