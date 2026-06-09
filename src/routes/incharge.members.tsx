import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2,
  Mail,
  Phone,
  Calendar,
  BookOpen,
  Activity,
  FileBarChart2,
  KeyRound,
  RefreshCw,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { MemberGradeReport } from "@/components/MemberGradeReport";
import { formatRelative } from "@/lib/grade-utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useServerFn } from "@tanstack/react-start";
import { adminResetPassword } from "@/lib/admin-users.functions";
import { CreateAccountDialog } from "@/components/ceo/FranchisesAndInvitesSection";
import { BulkCreateAccountsDialog } from "@/components/ceo/BulkCreateAccountsDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RosterTable } from "@/components/progress/RosterTable";

export const Route = createFileRoute("/incharge/members")({
  component: InchargeMembers,
});

interface MemberProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface MemberRow extends MemberProfile {
  email: string | null;
  assignments_count: number;
  lessons_completed: number;
  last_seen: string | null;
}

interface Franchise {
  id: string;
  name: string;
}

function initialsOf(name: string | null) {
  if (!name) return "—";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function generatePassword(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums = "23456789";
  const syms = "!@#$";
  const all = letters + upper + nums;
  let out = "";
  for (let i = 0; i < 10; i++) out += all[Math.floor(Math.random() * all.length)];
  out += nums[Math.floor(Math.random() * nums.length)];
  out += syms[Math.floor(Math.random() * syms.length)];
  return out;
}

function InchargeMembers() {
  const { profile, user } = useAuth();
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reportFor, setReportFor] = React.useState<MemberRow | null>(null);
  const [resetFor, setResetFor] = React.useState<MemberRow | null>(null);

  const load = React.useCallback(async () => {
    if (!profile?.franchise_id || !user) return;
    setLoading(true);

    const franchiseId = profile.franchise_id;

    const [profsRes, franchiseRes, emailsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, created_at")
        .eq("franchise_id", franchiseId)
        .order("full_name"),
      supabase.from("franchises").select("id, name").eq("id", franchiseId).maybeSingle(),
      supabase.rpc("get_franchise_member_emails", { _franchise_id: franchiseId }),
    ]);

    if (profsRes.error) toast.error(profsRes.error.message);
    if (emailsRes.error) toast.error(emailsRes.error.message);

    const allProfiles = (profsRes.data ?? []) as MemberProfile[];
    const memberProfiles = allProfiles.filter((p) => p.id !== user.id);
    const memberIds = memberProfiles.map((p) => p.id);

    const emailMap = new Map<string, string>();
    (emailsRes.data ?? []).forEach((row: { user_id: string; email: string }) => {
      emailMap.set(row.user_id, row.email);
    });

    const assignmentCounts = new Map<string, number>();
    const progressCounts = new Map<string, number>();
    const lastSeen = new Map<string, string>();

    if (memberIds.length) {
      const [aRes, lpRes, ssRes] = await Promise.all([
        supabase.from("assignments").select("user_id").in("user_id", memberIds),
        supabase
          .from("lesson_progress")
          .select("user_id")
          .in("user_id", memberIds)
          .eq("completed", true),
        supabase
          .from("study_sessions")
          .select("user_id, last_heartbeat_at")
          .in("user_id", memberIds)
          .order("last_heartbeat_at", { ascending: false }),
      ]);

      (aRes.data ?? []).forEach((r: { user_id: string }) => {
        assignmentCounts.set(r.user_id, (assignmentCounts.get(r.user_id) ?? 0) + 1);
      });
      (lpRes.data ?? []).forEach((r: { user_id: string }) => {
        progressCounts.set(r.user_id, (progressCounts.get(r.user_id) ?? 0) + 1);
      });
      (ssRes.data ?? []).forEach((r: { user_id: string; last_heartbeat_at: string }) => {
        if (!lastSeen.has(r.user_id)) lastSeen.set(r.user_id, r.last_heartbeat_at);
      });
    }

    const enriched: MemberRow[] = memberProfiles.map((p) => ({
      ...p,
      email: emailMap.get(p.id) ?? null,
      assignments_count: assignmentCounts.get(p.id) ?? 0,
      lessons_completed: progressCounts.get(p.id) ?? 0,
      last_seen: lastSeen.get(p.id) ?? null,
    }));

    setMembers(enriched);
    setFranchise((franchiseRes.data ?? null) as Franchise | null);
    setLoading(false);
  }, [profile?.franchise_id, user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const confirm = useConfirm();
  async function removeMember(m: MemberRow) {
    const ok = await confirm({
      title: "Remove member?",
      description: `Remove ${m.full_name ?? "this member"} from your franchise? Their account stays but they lose access.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("remove_member_from_franchise", { _user_id: m.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Member removed from franchise");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Create member accounts directly — they sign in with the temporary password and
            change it on first login.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateAccountDialog
            franchises={franchise ? [franchise] : []}
            onCreated={load}
            callerScope="incharge"
            lockFranchiseId={profile?.franchise_id ?? null}
            triggerLabel="Create member"
          />
          <BulkCreateAccountsDialog
            franchises={franchise ? [franchise] : []}
            onCreated={load}
            callerScope="incharge"
            lockFranchiseId={profile?.franchise_id ?? null}
          />
        </div>
      </header>

      <RosterTable scope="incharge" detailRoutePrefix="/incharge/members" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members yet — click <strong>Create member</strong> to add one.
            </p>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar className="h-12 w-12 shrink-0">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.full_name ?? ""} />}
                    <AvatarFallback className="text-sm font-semibold">
                      {initialsOf(m.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{m.full_name ?? "Unnamed"}</div>
                    <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {m.email && (
                        <span className="flex items-center gap-1.5 truncate">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{m.email}</span>
                        </span>
                      )}
                      {m.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" /> {m.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" /> Joined{" "}
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5" /> Last seen{" "}
                        {formatRelative(m.last_seen)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <BookOpen className="h-3 w-3" />
                        {m.assignments_count} course{m.assignments_count === 1 ? "" : "s"} assigned
                      </Badge>
                      <Badge variant="outline">
                        {m.lessons_completed} lesson{m.lessons_completed === 1 ? "" : "s"} done
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                  <Button size="sm" variant="outline" onClick={() => setReportFor(m)}>
                    <FileBarChart2 className="h-4 w-4" />
                    View report
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setResetFor(m)}>
                    <KeyRound className="h-4 w-4" />
                    Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMember(m)}
                    className="text-destructive hover:text-destructive"
                    aria-label="Remove from franchise"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reportFor} onOpenChange={(o) => !o && setReportFor(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {reportFor && (
            <MemberGradeReport
              userId={reportFor.id}
              fullName={reportFor.full_name}
              franchiseName={franchise?.name ?? null}
            />
          )}
        </DialogContent>
      </Dialog>

      <ResetPasswordDialog
        member={resetFor}
        onClose={() => setResetFor(null)}
      />
    </div>
  );
}

function ResetPasswordDialog({
  member,
  onClose,
}: {
  member: MemberRow | null;
  onClose: () => void;
}) {
  const [newPw, setNewPw] = React.useState(() => generatePassword());
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const resetFn = useServerFn(adminResetPassword);

  React.useEffect(() => {
    if (member) {
      setNewPw(generatePassword());
      setDone(false);
    }
  }, [member]);

  async function submit() {
    if (!member) return;
    setBusy(true);
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      setBusy(false);
      toast.error("Your session has expired. Please sign in again.");
      return;
    }
    const res = await resetFn({ data: { userId: member.id, newPassword: newPw, accessToken } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDone(true);
    toast.success("Password reset");
  }

  function copyShare() {
    if (!member) return;
    const text = `IRM Academy login\n\nName: ${member.full_name ?? ""}\nEmail: ${member.email ?? ""}\nNew temporary password: ${newPw}\n\nSign in at ${window.location.origin}/login — you'll be asked to change your password.`;
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {!member ? null : done ? (
          <>
            <DialogHeader>
              <DialogTitle>New temporary password</DialogTitle>
              <DialogDescription>
                Share with {member.full_name ?? member.email}. They'll change it on sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-sm space-y-1">
              <div>Email: {member.email}</div>
              <div>Password: {newPw}</div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copyShare}>
                <Copy className="h-4 w-4" /> Copy share-text
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Generate a new temporary password for {member.full_name ?? member.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <div className="flex gap-2">
                <Input
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewPw(generatePassword())}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={busy || newPw.length < 8}>
                {busy ? "Resetting…" : "Reset password"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
