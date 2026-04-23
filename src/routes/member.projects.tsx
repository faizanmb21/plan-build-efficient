import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Calendar, Upload, ExternalLink } from "lucide-react";
import {
  uploadProjectFile,
  getSignedSubmissionUrl,
  projectStatusBadgeClass,
  projectStatusLabel,
  type MemberProjectStatus,
} from "@/lib/project-utils";
import { letterColorClass } from "@/lib/grade-utils";

export const Route = createFileRoute("/member/projects")({
  component: MemberProjectsPage,
});

type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  attachment_path: string | null;
  deadline: string | null;
  created_at: string;
};
type SubmissionRow = {
  id: string;
  project_id: string;
  file_url: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function MemberProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [subs, setSubs] = React.useState<SubmissionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitFor, setSubmitFor] = React.useState<ProjectRow | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // Members can only SELECT projects via RLS where they have an assignment
    const projRes = await supabase
      .from("projects")
      .select("id,title,description,attachment_path,deadline,created_at")
      .order("created_at", { ascending: false });
    const subRes = await supabase
      .from("project_submissions")
      .select("id,project_id,file_url,status,letter_grade,feedback,reviewed_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setProjects((projRes.data ?? []) as ProjectRow[]);
    setSubs((subRes.data ?? []) as SubmissionRow[]);
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  // latest submission per project
  const latestByProject = React.useMemo(() => {
    const m = new Map<string, SubmissionRow>();
    for (const s of subs) {
      const prev = m.get(s.project_id);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) m.set(s.project_id, s);
    }
    return m;
  }, [subs]);

  function statusFor(projectId: string): MemberProjectStatus {
    const s = latestByProject.get(projectId);
    if (!s) return "not_submitted";
    return s.status;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My projects</h1>
        <p className="text-muted-foreground text-sm">
          Briefs assigned to you. Submit your work and your incharge will grade it.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>You haven't been assigned any projects.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => {
            const status = statusFor(p.id);
            const sub = latestByProject.get(p.id);
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      {p.description && (
                        <CardDescription className="mt-1 whitespace-pre-wrap">
                          {p.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {sub?.letter_grade && (
                        <Badge variant="outline" className={letterColorClass(sub.letter_grade)}>
                          {sub.letter_grade}
                        </Badge>
                      )}
                      <Badge variant="outline" className={projectStatusBadgeClass(status)}>
                        {projectStatusLabel(status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    {p.deadline && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due {new Date(p.deadline).toLocaleDateString()}
                      </span>
                    )}
                    {p.attachment_path && (
                      <BriefAttachmentLink path={p.attachment_path} />
                    )}
                  </div>
                  {sub?.feedback && (
                    <p className="bg-muted/50 rounded-md p-2 text-sm">{sub.feedback}</p>
                  )}
                  <div className="flex justify-end">
                    {(status === "not_submitted" || status === "revision") && (
                      <Button size="sm" onClick={() => setSubmitFor(p)} className="gap-2">
                        <Upload className="h-4 w-4" />
                        {status === "revision" ? "Resubmit" : "Submit"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SubmitDialog
        project={submitFor}
        userId={user?.id ?? ""}
        onClose={() => setSubmitFor(null)}
        onSubmitted={() => {
          setSubmitFor(null);
          load();
        }}
      />
    </div>
  );
}

function BriefAttachmentLink({ path }: { path: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    getSignedSubmissionUrl(path).then(setUrl);
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
      Reference file <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function SubmitDialog({
  project,
  userId,
  onClose,
  onSubmitted,
}: {
  project: ProjectRow | null;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (project) setFile(null);
  }, [project]);

  async function submit() {
    if (!project || !file) {
      toast.error("Pick a file");
      return;
    }
    setSubmitting(true);
    try {
      const path = await uploadProjectFile(userId, project.id, file);
      const { error } = await supabase.from("project_submissions").insert({
        project_id: project.id,
        user_id: userId,
        file_url: path,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Submitted! Your incharge will review it shortly.");
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!project) return null;
  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit: {project.title}</DialogTitle>
          <DialogDescription>Upload your final file. You can resubmit if it's marked as needing revision.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>File</Label>
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !file} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
