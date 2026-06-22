import * as React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, AlertCircle, Youtube } from "lucide-react";

interface Props {
  embedUrl: string;
  originalUrl: string;
  onPlay?: () => void;
}

// Loads the YouTube IFrame Player API exactly once.
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // @ts-expect-error - YT global from the iframe API
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    // @ts-expect-error - YT API callback
    const prev = window.onYouTubeIframeAPIReady;
    // @ts-expect-error - YT API callback
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve();
    };
    // @ts-expect-error - already loaded check
    if (window.YT && window.YT.Player) resolve();
  });
  return ytApiPromise;
}

function extractVideoId(embedUrl: string): string | null {
  const m = embedUrl.match(/\/embed\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function YouTubeEmbed({ embedUrl, originalUrl, onPlay }: Props) {
  const videoId = React.useMemo(() => extractVideoId(embedUrl), [embedUrl]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  const onPlayRef = React.useRef(onPlay);
  onPlayRef.current = onPlay;

  React.useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      // @ts-expect-error - YT global
      player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            // YT.PlayerState.PLAYING = 1
            if (e.data === 1) onPlayRef.current?.();
          },
          onError: (e: { data: number }) => {
            // 101 / 150 = embedding disabled by owner
            // 100 = video not found / private
            // 5 = HTML5 player error
            if ([5, 100, 101, 150].includes(e.data)) {
              setBlocked(true);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [videoId]);

  if (!videoId) {
    // Fallback to plain iframe if we can't parse the id (shouldn't happen).
    return (
      <iframe
        src={embedUrl}
        className="aspect-video w-full rounded-md border bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Lesson video"
      />
    );
  }

  if (blocked) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md border bg-muted/40 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-medium">This video must be watched on YouTube</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The video owner has disabled playback on other websites. You can
            still mark this lesson complete after watching.
          </p>
        </div>
        <Button asChild size="lg">
          <a href={originalUrl} target="_blank" rel="noreferrer">
            <Youtube className="h-4 w-4" /> Watch on YouTube
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-video w-full overflow-hidden rounded-md border bg-black">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="flex justify-end">
        <Button asChild size="sm" variant="ghost">
          <a href={originalUrl} target="_blank" rel="noreferrer">
            <Youtube className="h-3.5 w-3.5" /> Watch on YouTube
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}
