import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Send, Copy, Trash2, Users, Archive, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PillarFlower } from "@/components/PillarFlower";
import { getPillarScoresForUsers } from "@/lib/pillar-data";
import type { PillarScores } from "@/lib/pillars";

export const Route = createFileRoute("/ceo/franchises")({
  component: FranchisesPage,
});

interface Franchise {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
  archived_at: string | null;
  auto_delete_at: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: "ceo" | "incharge" | "member";
  franchise_id: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface MemberRow {
  id: string;
  full_name: string | null;
  franchise_id: string | null;
  role?: string;
}

function FranchisesPage() {
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const [f, i, p, r] = await Promise.all([
      supabase.from("franchises").select("*").order("created_at", { ascending: false }),
      supabase.from("invites").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, franchise_id"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setFranchises((f.data as Franchise[]) ?? []);
    setInvites((i.data as InviteRow[]) ?? []);
    const roleMap = new Map<string, string>();
    ((r.data as { user_id: string; role: string }[]) ?? []).forEach((x) =>
      roleMap.set(x.user_id, x.role),
    );
    setMembers(
      ((p.data as MemberRow[]) ?? []).map((m) => ({ ...m, role: roleMap.get(m.id) })),
    );
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Franchises &amp; team</h1>
          <p className="text-sm text-muted-foreground">
            Create franchises, invite incharges &amp; members.
          </p>
        </div>
        <div className="flex gap-2">
          <NewFranchiseDialog onCreated={load} />
          <NewInviteDialog franchises={franchises} onCreated={load} />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Franchises ({franchises.length})
        </h2>
        {franchises.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No franchises yet. Create your first one to start adding members.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {franchises.map((f) => {
              const team = members.filter((m) => m.franchise_id === f.id);
              return (
                <Card key={f.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="h-4 w-4 text-accent" /> {f.name}
                    </CardTitle>
                    {f.location && <CardDescription>{f.location}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {team.length} member
                      {team.length === 1 ? "" : "s"}
                    </div>
                    {team.slice(0, 4).map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs"
                      >
                        <span className="truncate">{m.full_name ?? "Unnamed"}</span>
                        {m.role && (
                          <Badge variant="outline" className="capitalize">
                            {m.role}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Invites ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No invites yet. Click <strong>New invite</strong> above to send one.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {invites.map((inv) => (
                  <InviteRowItem key={inv.id} invite={inv} franchises={franchises} onChange={load} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function NewFranchiseDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("franchises").insert({
      name: name.trim(),
      location: location.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Franchise created");
    setName("");
    setLocation("");
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" /> New franchise
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create franchise</DialogTitle>
          <DialogDescription>Add a new branch / location to your academy.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fname">Name</Label>
            <Input
              id="fname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Mumbai West"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="floc">Location (optional)</Label>
            <Input
              id="floc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, address, etc."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create franchise"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewInviteDialog({
  franchises,
  onCreated,
}: {
  franchises: Franchise[];
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"incharge" | "member">("member");
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase
      .from("invites")
      .insert({
        email: email.trim().toLowerCase(),
        role,
        franchise_id: franchiseId || null,
      })
      .select("token")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const link = `${window.location.origin}/invite/${data.token}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Invite created — link copied to clipboard");
    setEmail("");
    setFranchiseId("");
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="h-4 w-4" /> New invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send invite</DialogTitle>
          <DialogDescription>
            Generate an invite link. Share it with the person — when they open it they can create
            their account and join your academy.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="iemail">Email</Label>
            <Input
              id="iemail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "incharge" | "member")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member (learner)</SelectItem>
                <SelectItem value="incharge">Incharge (franchise manager)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Franchise</Label>
            <Select value={franchiseId} onValueChange={setFranchiseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select franchise (optional)" />
              </SelectTrigger>
              <SelectContent>
                {franchises.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {franchises.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No franchises yet — create one first if you want to assign this user to a branch.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Creating…" : "Create invite link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteRowItem({
  invite,
  franchises,
  onChange,
}: {
  invite: InviteRow;
  franchises: Franchise[];
  onChange: () => void;
}) {
  const expired = new Date(invite.expires_at) < new Date();
  const status = invite.accepted_at
    ? { label: "Accepted", variant: "default" as const }
    : expired
      ? { label: "Expired", variant: "destructive" as const }
      : { label: "Pending", variant: "secondary" as const };
  const franchise = franchises.find((f) => f.id === invite.franchise_id);
  const link = `${window.location.origin}/invite/${invite.token}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  }

  async function revoke() {
    if (!confirm("Delete this invite?")) return;
    const { error } = await supabase.from("invites").delete().eq("id", invite.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite deleted");
    onChange();
  }

  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{invite.email}</span>
          <Badge variant="outline" className="capitalize">
            {invite.role}
          </Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {franchise ? franchise.name : "No franchise"} ·{" "}
          {invite.accepted_at
            ? `Joined ${new Date(invite.accepted_at).toLocaleDateString()}`
            : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {!invite.accepted_at && !expired && (
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={revoke} className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
