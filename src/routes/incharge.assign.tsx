import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Send, Trash2, Loader2, Check, ChevronsUpDown, X, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/incharge/assign")({
  component: InchargeAssignPage,
});

type Course = { id: string; title: string };
type Member = { id: string; full_name: string | null };
type RoleRow = { user_id: string; role: "ceo" | "incharge" | "member" };
type Assignment = {
  id: string;
  course_id: string;
  user_id: string;
  priority: "mandatory" | "recommended";
  deadline: string | null;
  created_at: string;
};

type Scope = "members" | "franchise";

function InchargeAssignPage() {
  const { user, realProfile, profile, viewAsFranchiseId } = useAuth();
  const franchiseId = viewAsFranchiseId ?? realProfile?.franchise_id ?? profile?.franchise_id ?? null;

  const [courses, setCourses] = React.useState<Course[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [courseIds, setCourseIds] = React.useState<string[]>([]);
  const [scope, setScope] = React.useState<Scope>("franchise");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [deadline, setDeadline] = React.useState<string>("");

  const [coursePopoverOpen, setCoursePopoverOpen] = React.useState(false);
  const [memberPopoverOpen, setMemberPopoverOpen] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    if (!franchiseId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [profsRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("franchise_id", franchiseId)
        .order("full_name"),
      supabase.from("user_roles").select("user_id, role").eq("role", "member"),
    ]);

    const memberRoleIds = new Set(((rolesRes.data ?? []) as RoleRow[]).map((row) => row.user_id));
    const memberRows = (profsRes.data ?? []).filter(
      (m) => m.id !== user.id && memberRoleIds.has(m.id),
    ) as Member[];
    const memberIdsAll = memberRows.map((m) => m.id);

    const [coursesRes, assignmentsRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id, title")
        .eq("status", "published")
        .order("title"),
      memberIdsAll.length
        ? supabase
            .from("assignments")
            .select("id, course_id, user_id, priority, deadline, created_at")
            .in("user_id", memberIdsAll)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as Assignment[], error: null }),
    ]);

    if (profsRes.error) toast.error(profsRes.error.message);
    if (rolesRes.error) toast.error(rolesRes.error.message);
    if (coursesRes.error) toast.error(coursesRes.error.message);
    if (assignmentsRes.error) toast.error(assignmentsRes.error.message);

    setMembers(memberRows);
    setCourses(coursesRes.data ?? []);
    setAssignments((assignmentsRes.data ?? []) as Assignment[]);
    setLoading(false);
  }, [franchiseId, user]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const memberMap = React.useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);
  const courseMap = React.useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleAssign(overrideScope?: Scope) {
    if (courseIds.length === 0) {
      toast.error("Pick at least one course");
      return;
    }
    const effectiveScope = overrideScope ?? scope;
    let targetIds: string[] = [];
    if (effectiveScope === "members") {
      if (memberIds.length === 0) {
        toast.error("Pick at least one member");
        return;
      }
      targetIds = memberIds;
    } else {
      targetIds = members.map((m) => m.id);
      if (targetIds.length === 0) {
        toast.error("No members in your franchise yet");
        return;
      }
    }

    setSubmitting(true);
    const rows = targetIds.flatMap((uid) =>
      courseIds.map((cid) => ({
        course_id: cid,
        user_id: uid,
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        assigned_by: user?.id ?? null,
      })),
    );

    // Fetch existing (course_id,user_id) pairs to skip duplicates (unique constraint)
    const { data: existing, error: existErr } = await supabase
      .from("assignments")
      .select("course_id, user_id")
      .in("user_id", targetIds)
      .in("course_id", courseIds);
    if (existErr) {
      setSubmitting(false);
      toast.error(existErr.message);
      return;
    }
    const existingSet = new Set((existing ?? []).map((r) => `${r.course_id}:${r.user_id}`));
    const newRows = rows.filter((r) => !existingSet.has(`${r.course_id}:${r.user_id}`));
    const skipped = rows.length - newRows.length;

    if (newRows.length === 0) {
      setSubmitting(false);
      const targetLabel = targetIds
        .slice(0, 3)
        .map((id) => memberMap.get(id)?.full_name ?? "Member")
        .join(", ");
      const extraTargets = targetIds.length > 3 ? ` +${targetIds.length - 3} more` : "";
      const courseLabel = courseIds
        .slice(0, 2)
        .map((id) => courseMap.get(id)?.title ?? "this course")
        .join(", ");
      const extraCourses = courseIds.length > 2 ? ` +${courseIds.length - 2} more` : "";
      toast.info(
        `${targetLabel}${extraTargets} already ${targetIds.length === 1 ? "has" : "have"} ${courseLabel}${extraCourses} assigned. It will show in the member dashboard under All or Not started.`,
      );
      return;
    }

    const { error } = await supabase.from("assignments").insert(newRows);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Assigned ${newRows.length} new assignment${newRows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} already existed, skipped)` : ""}`,
    );
    setCourseIds([]);
    setMemberIds([]);
    setDeadline("");
    loadAll();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Assignment removed");
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  if (!franchiseId) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        You're not assigned to a franchise yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assign courses</h1>
        <p className="text-muted-foreground text-sm">
          Send one or more published courses to selected members or your whole franchise.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New assignment</CardTitle>
          <CardDescription>Only published courses can be assigned.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Course(s)</Label>
              <Popover open={coursePopoverOpen} onOpenChange={setCoursePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {courseIds.length === 0
                        ? "Pick course(s)"
                        : `${courseIds.length} course${courseIds.length === 1 ? "" : "s"} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search courses…" />
                    <CommandList>
                      <CommandEmpty>No courses found.</CommandEmpty>
                      <CommandGroup>
                        {courses.map((c) => {
                          const checked = courseIds.includes(c.id);
                          return (
                            <CommandItem
                              key={c.id}
                              value={c.title}
                              onSelect={() => toggleCourse(c.id)}
                              className="flex items-center gap-2"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <span className="flex-1 truncate">{c.title}</span>
                              {checked && <Check className="h-4 w-4 opacity-70" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {courseIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {courseIds.map((id) => {
                    const c = courseMap.get(id);
                    if (!c) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        <span className="max-w-[140px] truncate">{c.title}</span>
                        <button
                          type="button"
                          onClick={() => toggleCourse(id)}
                          className="hover:bg-background/40 rounded-full p-0.5"
                          aria-label={`Remove ${c.title}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as "mandatory" | "recommended")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as Scope)}
              className="grid gap-2 md:grid-cols-2"
            >
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3",
                  scope === "members" && "border-primary",
                )}
              >
                <RadioGroupItem value="members" id="scope-members" />
                <span>Selected member(s)</span>
              </label>
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3",
                  scope === "franchise" && "border-primary",
                )}
              >
                <RadioGroupItem value="franchise" id="scope-franchise" />
                <span>Whole franchise ({members.length})</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "members" && (
            <div className="space-y-2">
              <Label>Member(s)</Label>
              <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {memberIds.length === 0
                        ? "Pick member(s)"
                        : `${memberIds.length} member${memberIds.length === 1 ? "" : "s"} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search members by name…" />
                    <CommandList>
                      <CommandEmpty>No members found.</CommandEmpty>
                      <CommandGroup>
                        {members.map((m) => {
                          const checked = memberIds.includes(m.id);
                          const name = m.full_name || "(unnamed)";
                          return (
                            <CommandItem
                              key={m.id}
                              value={name}
                              onSelect={() => toggleMember(m.id)}
                              className="flex items-center gap-2"
                            >
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
                  <button
                    type="button"
                    onClick={() => setMemberIds([])}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  >
                    Clear all
                  </button>
                  {memberIds.map((id) => {
                    const m = memberMap.get(id);
                    if (!m) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        <span className="max-w-[140px] truncate">
                          {m.full_name || "(unnamed)"}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleMember(id)}
                          className="hover:bg-background/40 rounded-full p-0.5"
                          aria-label="Remove member"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setMemberIds(members.map((m) => m.id))}
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                >
                  Select all members
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Deadline (optional)</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {scope === "members" &&
            memberIds.length > 0 &&
            memberIds.length < members.length && (
              <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="flex-1">
                  <p className="font-medium text-amber-200">
                    Only {memberIds.length} of {members.length} members selected
                  </p>
                  <p className="text-amber-200/80">
                    The other {members.length - memberIds.length} members in your
                    franchise will not see this course. If you want everyone to see
                    it, assign to all.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-500/40"
                  onClick={() => handleAssign("franchise")}
                  disabled={submitting}
                >
                  <Users className="h-3.5 w-3.5" />
                  Assign to all
                </Button>
              </div>
            )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleAssign()} disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {scope === "franchise"
                ? `Assign to all ${members.length} members`
                : "Assign"}
            </Button>
            {scope === "members" && (
              <Button
                variant="secondary"
                onClick={() => handleAssign("franchise")}
                disabled={submitting || members.length === 0}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Assign to all my members ({members.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent assignments</CardTitle>
          <CardDescription>Latest 200 assignments to members of your franchise.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No assignments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const m = memberMap.get(a.user_id);
                    const c = courseMap.get(a.course_id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{c?.title ?? "—"}</TableCell>
                        <TableCell>{m?.full_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={a.priority === "mandatory" ? "default" : "secondary"}>
                            {a.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.deadline ? new Date(a.deadline).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(a.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
