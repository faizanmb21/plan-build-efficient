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
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { letterColorClass } from "@/lib/grade-utils";
import { ProjectGradeDialog } from "@/components/grading/ProjectGradeDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/ceo/projects")({
  component: CeoProjectsPage,
});

type Member = { id: string; full_name: string | null; franchise_id: string | null };
type Franchise = { id: string; name: string };
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
type AssignRow = { id: string; project_id: string; user_id: string; priority: string; assigned_by: string | null; created_at: string };
type AssignerRole = "ceo" | "incharge" | "qa" | "member";
type Assigner = { id: string; full_name: string | null; role: AssignerRole | null };
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
type AssignRowStatus = "not_submitted" | "pending" | "graded" | "revision";
type Row = {
  a: AssignRow;
  project: ProjectRow | undefined;
  member: Member | undefined;
  franchiseName: string;
  assigner: Assigner | undefined;
  sub: SubmissionRow | undefined;
  statusKey: AssignRowStatus;
  statusLabel: string;
};
type Scope = "members" | "franchise" | "everyone";

function CeoProjectsPage() {
  const { user } = useAuth();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [assigns, setAssigns] = React.useState<AssignRow[]>([]);
  const [subs, setSubs] = React.useState<SubmissionRow[]>([]);
  const [assigners, setAssigners] = React.useState<Assigner[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openProject, setOpenProject] = React.useState<ProjectRow | null>(null);
  const [editProject, setEditProject] = React.useState<ProjectRow | null>(null);
  const [reviewing, setReviewing] = React.useState<SubmissionRow | null>(null);
  const [filterText, setFilterText] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<"all" | "not_submitted" | "pending" | "graded" | "revision">("all");

  const memberMap = React.useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);
  const franchiseMap = React.useMemo(() => {
    const m = new Map<string, Franchise>();
    franchises.forEach((x) => m.set(x.id, x));
    return m;
  }, [franchises]);
  const projectMap = React.useMemo(() => {
    const m = new Map<string, ProjectRow>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);
  const assignerMap = React.useMemo(() => {
    const m = new Map<string, Assigner>();
    assigners.forEach((a) => m.set(a.id, a));
    return m;
  }, [assigners]);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    const [profsRes, fRes, projRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, franchise_id").order("full_name"),
      supabase.from("franchises").select("id, name").is("archived_at", null).order("name"),
      supabase
        .from("projects")
        .select("id,title,description,attachment_path,deadline,franchise_id,created_at,created_by")
        .order("created_at", { ascending: false }),
    ]);

    const projectIds = (projRes.data ?? []).map((p) => p.id);
    const [aRes, sRes] = await Promise.all([
      projectIds.length
        ? supabase.from("project_assignments").select("id,project_id,user_id,priority,assigned_by,created_at").in("project_id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabase
            .from("project_submissions")
            .select("id,project_id,user_id,file_url,status,letter_grade,grade,feedback,reviewed_at,created_at")
            .in("project_id", projectIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const assignRows = (aRes.data ?? []) as AssignRow[];

    // Resolve assigner identities + roles in one batch
    const assignerIds = Array.from(
      new Set(
        assignRows
          .map((a) => a.assigned_by)
          .concat((projRes.data ?? []).map((p) => p.created_by))
          .filter((v): v is string => !!v),
      ),
    );
    let assignerRows: Assigner[] = [];
    if (assignerIds.length) {
      const [apRes, arRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", assignerIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", assignerIds),
      ]);
      const roleByUser = new Map<string, AssignerRole>();
      const rolePriority: AssignerRole[] = ["ceo", "incharge", "qa", "member"];
      for (const r of (arRes.data ?? []) as { user_id: string; role: AssignerRole }[]) {
        const prev = roleByUser.get(r.user_id);
        if (!prev || rolePriority.indexOf(r.role) < rolePriority.indexOf(prev)) {
          roleByUser.set(r.user_id, r.role);
        }
      }
      assignerRows = ((apRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        role: roleByUser.get(p.id) ?? null,
      }));
    }

    setMembers((profsRes.data ?? []) as Member[]);
    setFranchises((fRes.data ?? []) as Franchise[]);
    setProjects((projRes.data ?? []) as ProjectRow[]);
    setAssigns(assignRows);
    setSubs((sRes.data ?? []) as SubmissionRow[]);
    setAssigners(assignerRows);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Latest submission per (project, user)
  const latestSubMap = React.useMemo(() => {
    const m = new Map<string, SubmissionRow>();
    for (const s of subs) {
      const k = `${s.project_id}:${s.user_id}`;
      const prev = m.get(k);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) m.set(k, s);
    }
    return m;
  }, [subs]);

  // Row type is declared at module scope (below) so AssignmentsTable can use it.

  const rows: Row[] = React.useMemo(() => {
    return assigns.map((a) => {
      const project = projectMap.get(a.project_id);
      const member = memberMap.get(a.user_id);
      const fId = member?.franchise_id ?? project?.franchise_id ?? null;
      const franchiseName = fId ? franchiseMap.get(fId)?.name ?? "—" : "All franchises";
      const assignerId = a.assigned_by ?? project?.created_by ?? null;
      const assigner = assignerId ? assignerMap.get(assignerId) : undefined;
      const sub = latestSubMap.get(`${a.project_id}:${a.user_id}`);
      let statusKey: Row["statusKey"];
      let statusLabel: string;
      if (!sub) { statusKey = "not_submitted"; statusLabel = "Not submitted"; }
      else if (sub.status === "pending") { statusKey = "pending"; statusLabel = "Pending review"; }
      else if (sub.status === "revision") { statusKey = "revision"; statusLabel = "Needs revision"; }
      else { statusKey = "graded"; statusLabel = "Graded"; }
      return { a, project, member, franchiseName, assigner, sub, statusKey, statusLabel };
    });
  }, [assigns, projectMap, memberMap, franchiseMap, assignerMap, latestSubMap]);

  const filteredRows = React.useMemo(() => {
    const t = filterText.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus !== "all" && r.statusKey !== filterStatus) return false;
      if (!t) return true;
      return (
        (r.project?.title ?? "").toLowerCase().includes(t) ||
        (r.member?.full_name ?? "").toLowerCase().includes(t) ||
        r.franchiseName.toLowerCase().includes(t) ||
        (r.assigner?.full_name ?? "").toLowerCase().includes(t)
      );
    });
  }, [rows, filterText, filterStatus]);


  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Create briefs and assign them across any franchise. Grade or oversee submissions.
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
            <CardDescription>Create your first project to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => {
            const pAssigns = assigns.filter((a) => a.project_id === p.id);
            const pSubs = subs.filter((s) => s.project_id === p.id);
            const graded = pSubs.filter((s) => s.status !== "pending").length;
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline">
                        {p.franchise_id ? franchiseMap.get(p.franchise_id)?.name ?? "—" : "CEO-wide"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setEditProject(p); }}
                        title="Edit project"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {p.description && (
                    <CardDescription className="line-clamp-2">{p.description}</CardDescription>
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

      {/* Unified assignments table — every project × member across the academy */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">All assignments</CardTitle>
              <CardDescription>
                Every project assignment across the academy — regardless of who created it.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Filter by project, member, franchise, assigner…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-9 w-72"
              />
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="not_submitted">Not submitted</SelectItem>
                  <SelectItem value="pending">Pending review</SelectItem>
                  <SelectItem value="graded">Graded</SelectItem>
                  <SelectItem value="revision">Needs revision</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <AssignmentsTable
            rows={filteredRows}
            loading={loading}
            onOpenProject={(pid) => {
              const p = projectMap.get(pid);
              if (p) setOpenProject(p);
            }}
            onReview={(sub) => setReviewing(sub)}
          />
        </CardContent>
      </Card>



      <CeoCreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={user?.id ?? ""}
        members={members}
        franchises={franchises}
        onCreated={() => {
          setCreateOpen(false);
          loadAll();
        }}
      />

      <CeoEditProjectDialog
        project={editProject}
        currentAssigns={assigns.filter((a) => a.project_id === editProject?.id)}
        members={members}
        franchises={franchises}
        userId={user?.id ?? ""}
        onClose={() => setEditProject(null)}
        onSaved={() => { setEditProject(null); loadAll(); }}
      />

      <Dialog open={!!openProject} onOpenChange={(v) => !v && setOpenProject(null)}>
        <DialogContent className="max-w-3xl">
          {openProject && (
            <>
              <DialogHeader>
                <DialogTitle>{openProject.title}</DialogTitle>
                {openProject.description && (
                  <DialogDescription className="whitespace-pre-wrap">
                    {openProject.description}
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="border-white/10 max-h-[50vh] overflow-y-auto rounded-md border">
                {(() => {
                  const pAssigns = assigns.filter((a) => a.project_id === openProject.id);
                  const pSubs = subs.filter((s) => s.project_id === openProject.id);
                  const latest = new Map<string, SubmissionRow>();
                  for (const s of pSubs) {
                    const prev = latest.get(s.user_id);
                    if (!prev || new Date(s.created_at) > new Date(prev.created_at)) latest.set(s.user_id, s);
                  }
                  if (pAssigns.length === 0) {
                    return <p className="text-muted-foreground p-4 text-sm">No assignees.</p>;
                  }
                  return (
                    <ul className="divide-white/10 divide-y">
                      {pAssigns.map((a) => {
                        const m = memberMap.get(a.user_id);
                        const sub = latest.get(a.user_id);
                        const fId = m?.franchise_id;
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {m?.full_name || "(unnamed)"}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {fId ? franchiseMap.get(fId)?.name ?? "—" : "—"} ·{" "}
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
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ProjectGradeDialog
        sub={reviewing}
        memberName={reviewing ? memberMap.get(reviewing.user_id)?.full_name ?? null : null}
        reviewerId={user?.id ?? ""}
        onClose={() => setReviewing(null)}
        onSaved={() => {
          setReviewing(null);
          loadAll();
        }}
      />
    </div>
  );
}

// ---------------- CEO create dialog ----------------

function CeoCreateProjectDialog({
  open,
  onOpenChange,
  userId,
  members,
  franchises,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  members: Member[];
  franchises: Franchise[];
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [scope, setScope] = React.useState<Scope>("members");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [memberPopoverOpen, setMemberPopoverOpen] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const memberMap = React.useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  function reset() {
    setTitle(""); setDescription(""); setDeadline(""); setPriority("mandatory");
    setScope("members"); setMemberIds([]); setFranchiseId(""); setAttachment(null);
  }

  function toggleMember(id: string) {
    setMemberIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function handleCreate() {
    if (!title.trim()) return toast.error("Title required");

    let targets: string[] = [];
    let projectFranchiseId: string | null = null;
    if (scope === "members") {
      if (memberIds.length === 0) return toast.error("Pick at least one member");
      targets = memberIds;
      // If all chosen members are in same franchise, set that as project franchise
      const fs = new Set(memberIds.map((id) => memberMap.get(id)?.franchise_id ?? null));
      if (fs.size === 1) projectFranchiseId = [...fs][0] ?? null;
    } else if (scope === "franchise") {
      if (!franchiseId) return toast.error("Pick a franchise");
      targets = members.filter((m) => m.franchise_id === franchiseId).map((m) => m.id);
      if (targets.length === 0) return toast.error("That franchise has no members");
      projectFranchiseId = franchiseId;
    } else {
      targets = members.filter((m) => !!m.franchise_id).map((m) => m.id);
      if (targets.length === 0) return toast.error("No members exist");
      projectFranchiseId = null;
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
          franchise_id: projectFranchiseId,
          created_by: userId,
          status: "published",
        })
        .select("id")
        .single();
      if (insErr || !proj) throw insErr ?? new Error("insert failed");

      const rows = targets.map((uid) => ({
        project_id: proj.id, user_id: uid, priority, assigned_by: userId,
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
          <DialogDescription>Cross-franchise allowed. Each member only sees their own copy.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Brief</Label>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <Input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="grid gap-2 md:grid-cols-3">
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "members" && "border-primary")}>
                <RadioGroupItem value="members" />
                <span>Selected members</span>
              </label>
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "franchise" && "border-primary")}>
                <RadioGroupItem value="franchise" />
                <span>Whole franchise</span>
              </label>
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "everyone" && "border-primary")}>
                <RadioGroupItem value="everyone" />
                <span>Everyone</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "franchise" && (
            <div className="space-y-2">
              <Label>Franchise</Label>
              <Select value={franchiseId} onValueChange={setFranchiseId}>
                <SelectTrigger><SelectValue placeholder="Pick a franchise" /></SelectTrigger>
                <SelectContent>
                  {franchises.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                        {members.filter((m) => !!m.franchise_id).map((m) => {
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

// ---------------- CEO Edit dialog ----------------

function CeoEditProjectDialog({
  project,
  currentAssigns,
  members,
  franchises,
  userId,
  onClose,
  onSaved,
}: {
  project: ProjectRow | null;
  currentAssigns: AssignRow[];
  members: Member[];
  franchises: Franchise[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [scope, setScope] = React.useState<Scope>("members");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [memberPopoverOpen, setMemberPopoverOpen] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const memberMap = React.useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  React.useEffect(() => {
    if (!project) return;
    setTitle(project.title);
    setDescription(project.description ?? "");
    setDeadline(project.deadline ? project.deadline.slice(0, 10) : "");
    setPriority((currentAssigns[0]?.priority as "mandatory" | "recommended") ?? "mandatory");
    const ids = currentAssigns.map((a) => a.user_id);
    setMemberIds(ids);
    setScope("members");
    setFranchiseId("");
    setAttachment(null);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMember(id: string) {
    setMemberIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function handleSave() {
    if (!project) return;
    if (!title.trim()) return toast.error("Title required");

    let targets: string[] = [];
    if (scope === "members") {
      if (memberIds.length === 0) return toast.error("Pick at least one member");
      targets = memberIds;
    } else if (scope === "franchise") {
      if (!franchiseId) return toast.error("Pick a franchise");
      targets = members.filter((m) => m.franchise_id === franchiseId).map((m) => m.id);
      if (targets.length === 0) return toast.error("That franchise has no members");
    } else {
      targets = members.filter((m) => !!m.franchise_id).map((m) => m.id);
      if (targets.length === 0) return toast.error("No members exist");
    }

    setSubmitting(true);
    try {
      let attachment_path = project.attachment_path;
      if (attachment) {
        const ext = attachment.name.split(".").pop() || "bin";
        const path = `project-briefs/${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("submissions")
          .upload(path, attachment, { upsert: false, contentType: attachment.type });
        if (upErr) throw upErr;
        attachment_path = path;
      }

      const { error: updErr } = await supabase
        .from("projects")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          attachment_path,
          deadline: deadline ? new Date(deadline).toISOString() : null,
        })
        .eq("id", project.id);
      if (updErr) throw updErr;

      const existingIds = new Set(currentAssigns.map((a) => a.user_id));
      const newIds = new Set(targets);
      const toAdd = targets.filter((id) => !existingIds.has(id));
      const toRemove = currentAssigns.filter((a) => !newIds.has(a.user_id)).map((a) => a.id);

      if (toRemove.length > 0) {
        const { error } = await supabase.from("project_assignments").delete().in("id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from("project_assignments").insert(
          toAdd.map((uid) => ({ project_id: project.id, user_id: uid, priority, assigned_by: userId })),
        );
        if (error) throw error;
      }
      const toKeep = currentAssigns.filter((a) => newIds.has(a.user_id)).map((a) => a.id);
      if (toKeep.length > 0) {
        await supabase.from("project_assignments").update({ priority }).in("id", toKeep);
      }

      toast.success("Project updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Changes apply immediately to all assigned members.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Brief</Label>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <Label>Replace reference attachment (optional)</Label>
            {project?.attachment_path && !attachment && (
              <p className="text-xs text-muted-foreground">Current attachment kept unless you pick a new file.</p>
            )}
            <Input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="grid gap-2 md:grid-cols-3">
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "members" && "border-primary")}>
                <RadioGroupItem value="members" /><span>Selected members</span>
              </label>
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "franchise" && "border-primary")}>
                <RadioGroupItem value="franchise" /><span>Whole franchise</span>
              </label>
              <label className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3", scope === "everyone" && "border-primary")}>
                <RadioGroupItem value="everyone" /><span>Everyone</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "franchise" && (
            <div className="space-y-2">
              <Label>Franchise</Label>
              <Select value={franchiseId} onValueChange={setFranchiseId}>
                <SelectTrigger><SelectValue placeholder="Pick a franchise" /></SelectTrigger>
                <SelectContent>
                  {franchises.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                        {members.filter((m) => !!m.franchise_id).map((m) => {
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Unified assignments table ----------------

function assignerRoleBadgeClass(role: AssignerRole | null | undefined): string {
  switch (role) {
    case "ceo":
      return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    case "incharge":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "qa":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    default:
      return "bg-white/5 text-muted-foreground border-white/10";
  }
}

function statusBadgeClass(s: AssignRowStatus): string {
  switch (s) {
    case "not_submitted":
      return "bg-white/5 text-muted-foreground border-white/10";
    case "pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "graded":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "revision":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
}

function AssignmentsTable({
  rows,
  loading,
  onOpenProject,
  onReview,
}: {
  rows: Row[];
  loading: boolean;
  onOpenProject: (projectId: string) => void;
  onReview: (sub: SubmissionRow) => void;
}) {
  if (loading) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">No assignments match.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Member</TableHead>
          <TableHead>Franchise</TableHead>
          <TableHead>Assigned by</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.a.id}>
            <TableCell className="max-w-[260px]">
              <button
                type="button"
                onClick={() => onOpenProject(r.a.project_id)}
                className="hover:text-primary truncate text-left font-medium"
                title={r.project?.title}
              >
                {r.project?.title ?? "(deleted project)"}
              </button>
            </TableCell>
            <TableCell className="truncate">{r.member?.full_name ?? "(unknown)"}</TableCell>
            <TableCell className="text-muted-foreground">{r.franchiseName}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="truncate">{r.assigner?.full_name ?? "—"}</span>
                {r.assigner?.role && (
                  <Badge variant="outline" className={cn("text-[10px] uppercase", assignerRoleBadgeClass(r.assigner.role))}>
                    {r.assigner.role}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {r.project?.deadline ? new Date(r.project.deadline).toLocaleDateString() : "—"}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusBadgeClass(r.statusKey)}>
                  {r.statusLabel}
                </Badge>
                {r.sub?.letter_grade && (
                  <Badge variant="outline" className={letterColorClass(r.sub.letter_grade)}>
                    {r.sub.letter_grade}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {r.sub ? (
                <Button size="sm" variant="outline" onClick={() => onReview(r.sub!)}>
                  {r.sub.status === "pending" ? "Review" : "View"}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onOpenProject(r.a.project_id)}>
                  Open
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
