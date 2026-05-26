import * as React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSignedSubmissionUrl } from "@/lib/project-utils";

function extOf(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return m ? m[1] : "";
}

export function SubmissionFilePreview({
  filePath,
  className,
}: {
  filePath: string;
  className?: string;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUrl(null);
    getSignedSubmissionUrl(filePath, 60 * 30).then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const ext = extOf(filePath);
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(ext);
  const isPdf = ext === "pdf";
  const isVideo = ["mp4", "webm", "mov", "m4v"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "m4a"].includes(ext);

  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/10 bg-black/30 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono">
            {filePath.split("/").pop() ?? filePath}
          </span>
        </div>
        {url && (
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </Button>
        )}
      </div>
      <div className="flex min-h-[260px] items-center justify-center">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !url ? (
          <p className="p-6 text-sm text-muted-foreground">Couldn't load preview.</p>
        ) : isImage ? (
          <img src={url} alt="Submission" className="max-h-[60vh] w-full object-contain" />
        ) : isPdf ? (
          <iframe
            src={url}
            title="Submission PDF"
            className="h-[60vh] w-full bg-white"
          />
        ) : isVideo ? (
          <video src={url} controls className="max-h-[60vh] w-full" />
        ) : isAudio ? (
          <audio src={url} controls className="w-full p-4" />
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-sm text-muted-foreground">
            <FileText className="h-8 w-8" />
            <p>No inline preview for .{ext || "file"}</p>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open file
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
