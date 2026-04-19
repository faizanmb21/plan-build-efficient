import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Trash2, UserPlus, Mail, Phone, Calendar, BookOpen, Activity, FileBarChart2 } from "lucide-react";
import { toast } from "sonner";
import { MemberGradeReport } from "@/components/MemberGradeReport";
import { formatRelative } from "@/lib/grade-utils";

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

interface Invite {
  id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
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

function InchargeMembers() {
  const { profile, user } = useAuth();
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reportFor, setReportFor] = React.useState<MemberRow | null>(null);

  const load = React.useCallback(async () => {
    if (!profile?.franchise_id || !user) return;
    setLoading(true);

    const franchiseId = profile.franchise_id;

    const [profsRes, invitesRes, franchiseRes, emailsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, created_at")
        .eq("franchise_id", franchiseId)
        .order("full_name"),
      supabase
        .from("invites")
        .select("id, email, token, accepted_at, expires_at, created_at")
        .eq("franchise_id", franchiseId)
        .order("created_at", { ascending: false }),
      supabase.from("franchises").select("id, name").eq("id", franchiseId).maybeSingle(),
      supabase.rpc("get_franchise_member_emails", { _franchise_id: franchiseId }),
    ]);

    if (profsRes.error) toast.error(profsRes.error.message);
    if (invitesRes.error) toast.error(invitesRes.error.message);
    if (emailsRes.error) toast.error(emailsRes.error.message);

    const allProfiles = (profsRes.data ?? []) as MemberProfile[];
    const memberProfiles = allProfiles.filter((p) => p.id !== user.id);
    const memberIds = memberProfiles.map((p) => p.id);

    const emailMap = new Map<string, string>();
    (emailsRes.data ?? []).forEach((row: { user_id: string; email: string }) => {
      emailMap.set(row.user_id, row.email);
    });

    let assignmentCounts = new Map<string, number>();
    let progressCounts = new Map<string, number>();
    let lastSeen = new Map<string, string>();

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
    setInvites((invitesRes.data ?? []) as Invite[]);
    setFranchise((franchiseRes.data ?? null) as Franchise | null);
    setLoading(false);
  }, [profile?.franchise_id, user]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function removeMember(m: MemberRow) {
    if (
      !confirm(
        `Remove ${m.full_name ?? "this member"} from your franchise? Their account stays but they lose access.`,
      )
    )
      return;
    const { error } = await supabase.rpc("remove_member_from_franchise", { _user_id: m.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Member removed from franchise");
      load();
    }
  }

  async function revokeInvite(inv: Invite) {
    if (!confirm(`Revoke invite for ${inv.email}?`)) return;
    const { error } = await supabase.from("invites").delete().eq("id", inv.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Invite revoked");
      load();
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Invite new members and manage who's on your franchise team.
          </p>
        </div>
        <InviteMemberDialog franchiseId={profile?.franchise_id ?? null} onCreated={load} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members yet — invite one to get started.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites sent yet.</p>
          ) : (
            invites.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < Date.now();
              const status = inv.accepted_at ? "accepted" : expired ? "expired" : "pending";
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{inv.email}</span>
                    <Badge
                      variant={
                        status === "accepted"
                          ? "default"
                          : status === "expired"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {!inv.accepted_at && !expired && (
                      <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                        <Copy className="h-3.5 w-3.5" /> Copy link
                      </Button>
                    )}
                    {!inv.accepted_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeInvite(inv)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
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
    </div>
  );
}

function InviteMemberDialog({
  franchiseId,
  onCreated,
}: {
  franchiseId: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!franchiseId) {
      toast.error("You're not assigned to a franchise");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("invites")
      .insert({
        email: email.trim().toLowerCase(),
        role: "member",
        franchise_id: franchiseId,
      })
      .select("token")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const url = `${window.location.origin}/invite/${data.token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Invite created — link copied to clipboard");
    setEmail("");
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Invite a new member</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              required
            />
            <p className="text-xs text-muted-foreground">
              They'll join your franchise as a member when they accept the invite link.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Creating…" : "Create invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
