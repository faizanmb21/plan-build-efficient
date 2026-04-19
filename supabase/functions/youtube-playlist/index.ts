// Fetch every video in a public YouTube playlist via the YouTube Data API v3.
// Returns titles, durations, thumbnails, and watch URLs so the client can
// bulk-create lessons. Public function — no auth required.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  watchUrl: string;
  position: number;
}

function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Already a bare ID
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) return trimmed;
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("list");
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// ISO 8601 duration "PT1H2M3S" → seconds
function isoDurationToSeconds(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY is not configured on the server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { playlistUrl } = (await req.json()) as { playlistUrl?: string };
    const playlistId = extractPlaylistId(playlistUrl ?? "");
    if (!playlistId) {
      return new Response(
        JSON.stringify({ error: "That doesn't look like a YouTube playlist link." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1) Page through playlistItems to collect every video ID + position + snippet.
    const items: Array<{
      videoId: string;
      title: string;
      description: string;
      thumbnailUrl: string | null;
      position: number;
    }> = [];
    let pageToken: string | undefined = undefined;
    let playlistTitle: string | null = null;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const r = await fetch(url.toString());
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        const msg = errBody?.error?.message ?? `YouTube API error (${r.status})`;
        return new Response(JSON.stringify({ error: msg }), {
          status: r.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const j = await r.json();
      pageToken = j.nextPageToken;

      for (const it of j.items ?? []) {
        const vid = it?.contentDetails?.videoId ?? it?.snippet?.resourceId?.videoId;
        if (!vid) continue;
        // Skip private/deleted videos — they have no usable snippet
        const title = it?.snippet?.title ?? "";
        if (title === "Private video" || title === "Deleted video" || !title) continue;
        items.push({
          videoId: vid,
          title,
          description: it?.snippet?.description ?? "",
          thumbnailUrl:
            it?.snippet?.thumbnails?.medium?.url ??
            it?.snippet?.thumbnails?.default?.url ??
            null,
          position: it?.snippet?.position ?? items.length,
        });
        if (!playlistTitle && it?.snippet?.channelTitle) {
          // best-effort fallback if /playlists endpoint isn't called
        }
      }
    } while (pageToken);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No videos found in this playlist (or it's private)." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Fetch durations in batches of 50 via /videos.
    const durations = new Map<string, number | null>();
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50).map((x) => x.videoId);
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("id", batch.join(","));
      url.searchParams.set("key", apiKey);
      const r = await fetch(url.toString());
      if (!r.ok) continue; // non-fatal — we still return videos without durations
      const j = await r.json();
      for (const v of j.items ?? []) {
        durations.set(v.id, isoDurationToSeconds(v?.contentDetails?.duration ?? ""));
      }
    }

    // 3) Optional: fetch playlist title via /playlists
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("id", playlistId);
      url.searchParams.set("key", apiKey);
      const r = await fetch(url.toString());
      if (r.ok) {
        const j = await r.json();
        playlistTitle = j?.items?.[0]?.snippet?.title ?? null;
      }
    } catch {
      // ignore
    }

    const result: { playlistTitle: string | null; items: PlaylistVideo[] } = {
      playlistTitle,
      items: items
        .sort((a, b) => a.position - b.position)
        .map((it) => ({
          videoId: it.videoId,
          title: it.title,
          description: it.description,
          durationSeconds: durations.get(it.videoId) ?? null,
          thumbnailUrl: it.thumbnailUrl,
          watchUrl: `https://www.youtube.com/watch?v=${it.videoId}`,
          position: it.position,
        })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
