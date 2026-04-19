// Server-side oEmbed proxy. Browsers can't call YouTube's oEmbed directly
// (no CORS headers), so we fetch it here and return the JSON with permissive CORS.
// Public function — no auth required (just metadata about a public URL).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface OEmbedResult {
  title: string | null;
  durationSeconds: number | null;
  provider: "youtube" | "vimeo" | "unknown";
}

function detectProvider(url: string): OEmbedResult["provider"] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("vimeo.com")) return "vimeo";
  } catch {
    // fall through
  }
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = detectProvider(url);
    const result: OEmbedResult = { title: null, durationSeconds: null, provider };

    if (provider === "youtube") {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      );
      if (r.ok) {
        const j = (await r.json()) as { title?: string };
        result.title = j.title?.trim() || null;
      }
    } else if (provider === "vimeo") {
      const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const j = (await r.json()) as { title?: string; duration?: number };
        result.title = j.title?.trim() || null;
        result.durationSeconds = typeof j.duration === "number" ? j.duration : null;
      }
    }

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
