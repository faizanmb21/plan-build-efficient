import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Trash2, UserPlus, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/incharge/members")({
  component: InchargeMembers,
});

interface Member {
  id: string;
  full_name: string | null;
  phone: string | null;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

function InchargeMembers() {
  const { profile } = useAuth();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!profile?.franchise_id) return;
    setLoading(true);
    const [{ data: profs, error: e1 }, { data: invs, error: e2 }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("franchise_id", profile.franchise_id)
        .order("full_name"),
      supabase
        .from("invites")
        .select("id, email, token, accepted_at, expires_at, created_at")
        .eq("franchise_id", profile.franchise_id)
        .order("created_at", { ascending: false }),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setMembers((profs ?? []) as Member[]);
    setInvites((invs ?? []) as Invite[]);
    setLoading(false);
  }, [profile?.franchise_id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function removeMember(m: Member) {
    if (!confirm(`Remove ${m.full_name ?? "this member"} from your franchise? Their account stays but they lose access.`)) return;
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
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet — invite one to get started.</p>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{m.full_name ?? "Unnamed"}</div>
                  {m.phone && <div className="text-xs text-muted-foreground">{m.phone}</div>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMember(m)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
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
                      variant={status === "accepted" ? "default" : status === "expired" ? "destructive" : "secondary"}
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
