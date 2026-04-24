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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Check,
  ChevronsUpDown,
  X,
  ClipboardList,
  Calendar,
  Users,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { letterColorClass } from "@/lib/grade-utils";
import { ProjectGradeDialog } from "@/components/grading/ProjectGradeDialog";

export const Route = createFileRoute("/incharge/projects")({
  component: InchargeProjectsPage,
});

type Member = { id: string; full_name: string | null };
type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  attachment_path: string | null;
  deadline: string | null;
  franchise_id: string | null;
  created_at: string;
  created_by: string;
};
type AssignRow = { id: string; project_id: string; user_id: string; priority: string };
type SubmissionRow = {
  id: string;
  project_id: string;
  user_id: string;
  file_url: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function InchargeProjectsPage() {
  const { user, profile } = useAuth();
  const franchiseId = profile?.franchise_id ?? null;

  const [members, setMembers] = React.useState<Member[]>([]);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [assigns, setAssigns] = React.useState<AssignRow[]>([]);
  const [subs, setSubs] = React.useState<SubmissionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openProject, setOpenProject] = React.useState<ProjectRow | null>(null);

  const memberMap = React.useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  const loadAll = React.useCallback(async () => {
    if (!franchiseId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const profsRes = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("franchise_id", franchiseId)
      .order("full_name");
    const memberRows = (profsRes.data ?? []).filter((m) => m.id !== user.id) as Member[];

    const projRes = await supabase
      .from("projects")
      .select("id,title,description,attachment_path,deadline,franchise_id,created_at,created_by")
      .order("created_at", { ascending: false });

    const projectIds = (projRes.data ?? []).map((p) => p.id);
    const [assignRes, subRes] = await Promise.all([
      projectIds.length
        ? supabase
            .from("project_assignments")
            .select("id,project_id,user_id,priority")
            .in("project_id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabase
            .from("project_submissions")
            .select("id,project_id,user_id,file_url,status,letter_grade,grade,feedback,reviewed_at,created_at")
            .in("project_id", projectIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    setMembers(memberRows);
    setProjects((projRes.data ?? []) as ProjectRow[]);
    setAssigns((assignRes.data ?? []) as AssignRow[]);
    setSubs((subRes.data ?? []) as SubmissionRow[]);
    setLoading(false);
  }, [franchiseId, user]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!franchiseId) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        You're not assigned to a franchise yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Standalone briefs you assign to members. Reviewed and graded just like practicals.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Click "New project" to write a brief and assign it to your members.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => {
            const pAssigns = assigns.filter((a) => a.project_id === p.id);
            const pSubs = subs.filter((s) => s.project_id === p.id);
            const graded = pSubs.filter(
              (s) => s.status === "approved" || s.status === "revision",
            ).length;
            const pending = pSubs.filter((s) => s.status === "pending").length;
            return (
              <Card
                key={p.id}
                interactive
                onClick={() => setOpenProject(p)}
                className="cursor-pointer"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    {p.franchise_id === null && (
                      <Badge variant="outline" className="shrink-0">CEO-wide</Badge>
                    )}
                  </div>
                  {p.description && (
                    <CardDescription className="line-clamp-2">
                      {p.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" /> {pAssigns.length} assigned
                  </span>
                  <span className="flex items-center gap-1 text-amber-300">
                    <ClipboardList className="h-3 w-3" /> {pending} pending
                  </span>
                  <span className="flex items-center gap-1 text-emerald-300">
                    <Check className="h-3 w-3" /> {graded} graded
                  </span>
                  {p.deadline && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(p.deadline).toLocaleDateString()}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        franchiseId={franchiseId}
        userId={user!.id}
        members={members}
        onCreated={() => {
          setCreateOpen(false);
          loadAll();
        }}
      />

      <ProjectDetailDialog
        project={openProject}
        memberMap={memberMap}
        assigns={assigns.filter((a) => a.project_id === openProject?.id)}
        subs={subs.filter((s) => s.project_id === openProject?.id)}
        reviewerId={user?.id ?? ""}
        onClose={() => setOpenProject(null)}
        onChanged={loadAll}
      />
    </div>
  );
}

// ---------------- Create dialog ----------------

function CreateProjectDialog({
  open,
  onOpenChange,
  franchiseId,
  userId,
  members,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  franchiseId: string;
  userId: string;
  members: Member[];
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [scope, setScope] = React.useState<"members" | "franchise">("members");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [memberPopoverOpen, setMemberPopoverOpen] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setDeadline("");
    setPriority("mandatory");
    setScope("members");
    setMemberIds([]);
    setAttachment(null);
  }

  const memberMap = React.useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Project title is required");
      return;
    }
    const targets = scope === "members" ? memberIds : members.map((m) => m.id);
    if (targets.length === 0) {
      toast.error("Pick at least one member");
      return;
    }

    setSubmitting(true);
    try {
      let attachment_path: string | null = null;
      if (attachment) {
        const ext = attachment.name.split(".").pop() || "bin";
        const path = `project-briefs/${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("submissions")
          .upload(path, attachment, { upsert: false, contentType: attachment.type });
        if (upErr) throw upErr;
        attachment_path = path;
      }

      const { data: proj, error: insErr } = await supabase
        .from("projects")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          attachment_path,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          franchise_id: franchiseId,
          created_by: userId,
          status: "published",
        })
        .select("id")
        .single();
      if (insErr || !proj) throw insErr ?? new Error("insert failed");

      const rows = targets.map((uid) => ({
        project_id: proj.id,
        user_id: uid,
        priority,
        assigned_by: userId,
      }));
      const { error: aErr } = await supabase.from("project_assignments").insert(rows);
      if (aErr) throw aErr;

      toast.success(`Project created and assigned to ${targets.length} member${targets.length === 1 ? "" : "s"}`);
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Write a brief, attach an optional reference file, and pick who should do it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brand reel — April"
            />
          </div>

          <div className="space-y-2">
            <Label>Brief</Label>
            <Textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the member should produce, tone, deliverable specs, etc."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Deadline (optional)</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reference attachment (optional)</Label>
            <Input
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as any)}
              className="grid gap-2 md:grid-cols-2"
            >
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "members" && "border-primary")}>
                <RadioGroupItem value="members" />
                <span>Selected member(s)</span>
              </label>
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "franchise" && "border-primary")}>
                <RadioGroupItem value="franchise" />
                <span>Whole franchise ({members.length})</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "members" && (
            <div className="space-y-2">
              <Label>Member(s)</Label>
              <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate">
                      {memberIds.length === 0 ? "Pick member(s)" : `${memberIds.length} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search members…" />
                    <CommandList>
                      <CommandEmpty>No members found.</CommandEmpty>
                      <CommandGroup>
                        {members.map((m) => {
                          const checked = memberIds.includes(m.id);
                          const name = m.full_name || "(unnamed)";
                          return (
                            <CommandItem key={m.id} value={name} onSelect={() => toggleMember(m.id)} className="flex items-center gap-2">
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <span className="flex-1 truncate">{name}</span>
                              {checked && <Check className="h-4 w-4 opacity-70" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {memberIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {memberIds.map((id) => {
                    const m = memberMap.get(id);
                    if (!m) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        <span className="max-w-[140px] truncate">{m.full_name || "(unnamed)"}</span>
                        <button type="button" onClick={() => toggleMember(id)} className="hover:bg-background/40 rounded-full p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create & assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Detail / grading dialog ----------------

function ProjectDetailDialog({
  project,
  memberMap,
  assigns,
  subs,
  reviewerId,
  onClose,
  onChanged,
}: {
  project: ProjectRow | null;
  memberMap: Map<string, Member>;
  assigns: AssignRow[];
  subs: SubmissionRow[];
  reviewerId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reviewing, setReviewing] = React.useState<SubmissionRow | null>(null);

  if (!project) return null;

  // Map user_id → latest submission
  const latestSub = new Map<string, SubmissionRow>();
  for (const s of subs) {
    const prev = latestSub.get(s.user_id);
    if (!prev || new Date(s.created_at) > new Date(prev.created_at)) {
      latestSub.set(s.user_id, s);
    }
  }

  return (
    <>
      <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{project.title}</DialogTitle>
            {project.description && (
              <DialogDescription className="whitespace-pre-wrap">
                {project.description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              {project.deadline && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Due {new Date(project.deadline).toLocaleDateString()}
                </span>
              )}
              <span>Assigned: {assigns.length}</span>
            </div>

            <div className="border-white/10 max-h-[50vh] overflow-y-auto rounded-md border">
              {assigns.length === 0 ? (
                <p className="text-muted-foreground p-4 text-sm">No one assigned yet.</p>
              ) : (
                <ul className="divide-white/10 divide-y">
                  {assigns.map((a) => {
                    const m = memberMap.get(a.user_id);
                    const sub = latestSub.get(a.user_id);
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {m?.full_name || "(unnamed)"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {!sub
                              ? "Not submitted"
                              : sub.status === "pending"
                                ? "Pending review"
                                : sub.reviewed_at
                                  ? `Graded ${new Date(sub.reviewed_at).toLocaleDateString()}`
                                  : "Submitted"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {sub?.letter_grade && (
                            <Badge variant="outline" className={letterColorClass(sub.letter_grade)}>
                              {sub.letter_grade}
                            </Badge>
                          )}
                          {sub && (
                            <Button size="sm" variant="outline" onClick={() => setReviewing(sub)}>
                              {sub.status === "pending" ? "Review" : "View"}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectGradeDialog
        sub={reviewing}
        memberName={reviewing ? memberMap.get(reviewing.user_id)?.full_name ?? null : null}
        reviewerId={reviewerId}
        onClose={() => setReviewing(null)}
        onSaved={() => {
          setReviewing(null);
          onChanged();
        }}
      />
    </>
  );
}
