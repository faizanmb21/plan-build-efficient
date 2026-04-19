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

export const Route = createFileRoute("/incharge/assign")({
  component: InchargeAssignPage,
});

type Course = { id: string; title: string };
type Member = { id: string; full_name: string | null };
type Assignment = {
  id: string;
  course_id: string;
  user_id: string;
  priority: "mandatory" | "recommended";
  deadline: string | null;
  created_at: string;
};

type Scope = "member" | "franchise";

function InchargeAssignPage() {
  const { user, profile } = useAuth();
  const franchiseId = profile?.franchise_id ?? null;

  const [courses, setCourses] = React.useState<Course[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [courseId, setCourseId] = React.useState<string>("");
  const [scope, setScope] = React.useState<Scope>("member");
  const [memberId, setMemberId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<"mandatory" | "recommended">("mandatory");
  const [deadline, setDeadline] = React.useState<string>("");

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
    const memberIds = memberRows.map((m) => m.id);

    const [coursesRes, assignmentsRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id, title")
        .eq("status", "published")
        .order("title"),
      memberIds.length
        ? supabase
            .from("assignments")
            .select("id, course_id, user_id, priority, deadline, created_at")
            .in("user_id", memberIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as Assignment[], error: null }),
    ]);

    if (profsRes.error) toast.error(profsRes.error.message);
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
    } else {
      targetIds = members.map((m) => m.id);
      if (targetIds.length === 0) {
        toast.error("No members in your franchise yet");
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
          Send a published course to one of your members or to your whole franchise.
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
              className="grid gap-2 md:grid-cols-2"
            >
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value="member" id="scope-member" />
                <span>Single member</span>
              </label>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value="franchise" id="scope-franchise" />
                <span>Whole franchise ({members.length})</span>
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
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Assign
          </Button>
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
