// Detect and normalize video links from popular platforms into a safe embed URL.
// Returns null when the URL doesn't match anything we know how to embed.

export type EmbedProvider = "youtube" | "vimeo" | "loom" | "drive" | "gdoc" | "direct";

export interface ParsedEmbed {
  provider: EmbedProvider;
  embedUrl: string;
  // The user-visible original URL (kept for editing/display)
  originalUrl: string;
}

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

export function parseVideoUrl(raw: string): ParsedEmbed | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Salvage pastes with junk around the link (leading text, double-pasted
    // URLs, trailing punctuation): grab the first http(s) run and retry.
    const salvaged = trimmed.match(/https?:\/\/\S+/)?.[0];
    if (!salvaged) return null;
    try {
      u = new URL(salvaged);
    } catch {
      return null;
    }
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();

  // YouTube
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (!isValidYtId(id)) return null;
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
      originalUrl: trimmed,
    };
  }
  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] ?? null;
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] ?? null;
    else if (u.pathname.startsWith("/live/")) id = u.pathname.split("/")[2] ?? null;
    if (id && isValidYtId(id)) {
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
        originalUrl: trimmed,
      };
    }
  }

  // Vimeo
  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    // /123456789  or  /channels/foo/123456789  or  player.vimeo.com/video/123456789
    const segments = u.pathname.split("/").filter(Boolean);
    const id = segments.reverse().find((s) => /^\d+$/.test(s));
    if (id) {
      return {
        provider: "vimeo",
        embedUrl: `https://player.vimeo.com/video/${id}`,
        originalUrl: trimmed,
      };
    }
  }

  // Loom
  if (host === "loom.com" || host === "www.loom.com") {
    // /share/<id>  or  /embed/<id>
    const segments = u.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((s) => s === "share" || s === "embed");
    const id = idx >= 0 ? segments[idx + 1] : segments[segments.length - 1];
    if (id && /^[a-z0-9]{16,}$/i.test(id)) {
      return {
        provider: "loom",
        embedUrl: `https://www.loom.com/embed/${id}`,
        originalUrl: trimmed,
      };
    }
  }

  // Google Drive — file/d/<id>/view  or  open?id=<id>
  if (host === "drive.google.com") {
    let id: string | null = null;
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) id = m[1];
    if (!id) id = u.searchParams.get("id");
    if (id) {
      return {
        provider: "drive",
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        originalUrl: trimmed,
      };
    }
  }

  // Google Docs / Sheets / Slides — trainers sometimes paste these into
  // video lessons. All three support an embeddable /preview mode (the /edit
  // URL refuses to render in an iframe).
  if (host === "docs.google.com") {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
    if (m) {
      return {
        provider: "gdoc",
        embedUrl: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`,
        originalUrl: trimmed,
      };
    }
  }

  // Direct video file (.mp4, .webm, .mov) — render in <video>
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(u.pathname)) {
    return { provider: "direct", embedUrl: trimmed, originalUrl: trimmed };
  }

  return null;
}

function isValidYtId(id: string | null | undefined): id is string {
  return !!id && /^[a-zA-Z0-9_-]{6,}$/.test(id);
}

// Returns a high-quality YouTube thumbnail URL for any YouTube watch/share/embed/shorts URL,
// or null if the URL isn't a recognised YouTube link.
export function getYouTubeThumbnail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.replace(/^\//, "").split("/")[0] || null;
  } else if (YT_HOSTS.has(host)) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] ?? null;
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] ?? null;
    else if (u.pathname.startsWith("/live/")) id = u.pathname.split("/")[2] ?? null;
  }
  if (!isValidYtId(id)) return null;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
