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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Send, Trash2, Loader2 } from "lucide-react";

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

type Scope = "member" | "franchise" | "everyone";

function AssignPage() {
  const { user } = useAuth();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [courseId, setCourseId] = React.useState<string>("");
  const [scope, setScope] = React.useState<Scope>("member");
  const [memberId, setMemberId] = React.useState<string>("");
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [deadline, setDeadline] = React.useState<string>("");

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

  async function handleAssign() {
    if (!courseId) {
      toast.error("Pick a course");
      return;
    }

    let targetIds: string[] = [];
    if (scope === "member") {
      if (!memberId) {
        toast.error("Pick a member");
        return;
      }
      targetIds = [memberId];
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
    const rows = targetIds.map((uid) => ({
      course_id: courseId,
      user_id: uid,
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      assigned_by: user?.id ?? null,
    }));

    const { error } = await supabase.from("assignments").insert(rows);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Assigned to ${targetIds.length} member${targetIds.length === 1 ? "" : "s"}`);
    setMemberId("");
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
          Send a published course to a member, a whole franchise, or everyone.
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
              <Label>Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.length === 0 && (
                    <div className="text-muted-foreground px-2 py-1.5 text-sm">
                      No published courses
                    </div>
                  )}
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value="member" id="scope-member" />
                <span>Single member</span>
              </label>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value="franchise" id="scope-franchise" />
                <span>Whole franchise</span>
              </label>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value="everyone" id="scope-everyone" />
                <span>Everyone</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "member" && (
            <div className="space-y-2">
              <Label>Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || "(unnamed)"}
                      {m.franchise_id
                        ? ` — ${franchiseMap.get(m.franchise_id)?.name ?? "?"}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {franchises.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
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

          <Button onClick={handleAssign} disabled={submitting} className="gap-2">
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
