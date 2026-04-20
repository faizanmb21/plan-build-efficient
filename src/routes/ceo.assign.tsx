import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Send, Trash2, Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ceo/assign")({
  component: AssignPage,
});

type Course = { id: string; title: string; status: string };
type Franchise = { id: string; name: string };
type Member = { id: string; full_name: string | null; franchise_id: string | null };
type Assignment = {
  id: string;
  course_id: string;
  user_id: string;
  priority: "mandatory" | "recommended";
  deadline: string | null;
  created_at: string;
};

type Scope = "members" | "franchise" | "everyone";

function AssignPage() {
  const { user } = useAuth();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [courseIds, setCourseIds] = React.useState<string[]>([]);
  const [scope, setScope] = React.useState<Scope>("members");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [deadline, setDeadline] = React.useState<string>("");

  const [coursePopoverOpen, setCoursePopoverOpen] = React.useState(false);
  const [memberPopoverOpen, setMemberPopoverOpen] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    const [c, f, m, a] = await Promise.all([
      supabase
        .from("courses")
        .select("id, title, status")
        .eq("status", "published")
        .order("title"),
      supabase.from("franchises").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, franchise_id").order("full_name"),
      supabase
        .from("assignments")
        .select("id, course_id, user_id, priority, deadline, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (c.error) toast.error(c.error.message);
    if (f.error) toast.error(f.error.message);
    if (m.error) toast.error(m.error.message);
    if (a.error) toast.error(a.error.message);
    setCourses(c.data ?? []);
    setFranchises(f.data ?? []);
    setMembers(m.data ?? []);
    setAssignments((a.data ?? []) as Assignment[]);
    setLoading(false);
  }, []);

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
  const franchiseMap = React.useMemo(() => {
    const map = new Map<string, Franchise>();
    franchises.forEach((f) => map.set(f.id, f));
    return map;
  }, [franchises]);

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canAssign =
    courseIds.length > 0 &&
    ((scope === "members" && memberIds.length > 0) ||
      (scope === "franchise" && franchiseId) ||
      scope === "everyone");

  async function handleAssign() {
    if (courseIds.length === 0) {
      toast.error("Pick at least one course");
      return;
    }

    let targetIds: string[] = [];
    if (scope === "members") {
      if (memberIds.length === 0) {
        toast.error("Pick at least one member");
        return;
      }
      targetIds = memberIds;
    } else if (scope === "franchise") {
      if (!franchiseId) {
        toast.error("Pick a franchise");
        return;
      }
      targetIds = members.filter((m) => m.franchise_id === franchiseId).map((m) => m.id);
      if (targetIds.length === 0) {
        toast.error("No members in that franchise yet");
        return;
      }
    } else {
      targetIds = members.map((m) => m.id);
      if (targetIds.length === 0) {
        toast.error("No members to assign");
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
      toast.info("All targets already have these courses assigned");
      return;
    }

    const { error } = await supabase.from("assignments").insert(newRows);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Assigned ${newRows.length} (${courseIds.length} course${courseIds.length === 1 ? "" : "s"} × ${targetIds.length} member${targetIds.length === 1 ? "" : "s"})${skipped ? `. Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.` : ""}`,
    );
    setCourseIds([]);
    setMemberIds([]);
    setFranchiseId("");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assign courses</h1>
        <p className="text-muted-foreground text-sm">
          Send one or more published courses to selected members, a whole franchise, or everyone.
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
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
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
              className="grid gap-2 md:grid-cols-3"
            >
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3",
                  scope === "members" && "border-primary",
                )}
              >
                <RadioGroupItem value="members" id="scope-members" />
                <span>Selected members</span>
              </label>
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3",
                  scope === "franchise" && "border-primary",
                )}
              >
                <RadioGroupItem value="franchise" id="scope-franchise" />
                <span>Whole franchise</span>
              </label>
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3",
                  scope === "everyone" && "border-primary",
                )}
              >
                <RadioGroupItem value="everyone" id="scope-everyone" />
                <span>Everyone ({members.length})</span>
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
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search members by name…" />
                    <CommandList>
                      <CommandEmpty>No members found.</CommandEmpty>
                      <CommandGroup>
                        {members.map((m) => {
                          const checked = memberIds.includes(m.id);
                          const name = m.full_name || "(unnamed)";
                          const fname = m.franchise_id
                            ? franchiseMap.get(m.franchise_id)?.name
                            : null;
                          return (
                            <CommandItem
                              key={m.id}
                              value={`${name} ${fname ?? ""}`}
                              onSelect={() => toggleMember(m.id)}
                              className="flex items-center gap-2"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <span className="flex-1 truncate">{name}</span>
                              {fname && (
                                <span className="text-muted-foreground text-xs">{fname}</span>
                              )}
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
            </div>
          )}

          {scope === "franchise" && (
            <div className="space-y-2">
              <Label>Franchise</Label>
              <Select value={franchiseId} onValueChange={setFranchiseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a franchise" />
                </SelectTrigger>
                <SelectContent>
                  {franchises.map((f) => {
                    const count = members.filter((m) => m.franchise_id === f.id).length;
                    return (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
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

          <Button
            onClick={handleAssign}
            disabled={submitting || !canAssign}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Assign
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent assignments</CardTitle>
          <CardDescription>Latest 200 assignments across the company.</CardDescription>
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
                    <TableHead>Franchise</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const m = memberMap.get(a.user_id);
                    const c = courseMap.get(a.course_id);
                    const f = m?.franchise_id ? franchiseMap.get(m.franchise_id) : null;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{c?.title ?? "—"}</TableCell>
                        <TableCell>{m?.full_name ?? "—"}</TableCell>
                        <TableCell>{f?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={a.priority === "mandatory" ? "default" : "secondary"}
                          >
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
