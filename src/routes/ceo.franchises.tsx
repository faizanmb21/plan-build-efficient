import { createFileRoute, Link } from "@tanstack/react-router";
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
import {
  Building2,
  Plus,
  Send,
  Copy,
  Trash2,
  Users,
  Archive,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  MapPin,
} from "lucide-react";
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
  manager_id: string | null;
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
  const [showArchived, setShowArchived] = React.useState(false);
  const [scoresByFranchise, setScoresByFranchise] = React.useState<Record<string, PillarScores>>({});
  const [franchiseOpen, setFranchiseOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const [f, i, p, r] = await Promise.all([
      supabase.from("franchises").select("*").order("created_at", { ascending: false }),
      supabase.from("invites").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, franchise_id"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const allF = (f.data as Franchise[]) ?? [];
    setFranchises(allF);
    setInvites((i.data as InviteRow[]) ?? []);

    const roleMap = new Map<string, string>();
    ((r.data as { user_id: string; role: string }[]) ?? []).forEach((x) => {
      roleMap.set(x.user_id, x.role);
    });

    const memberList = ((p.data as MemberRow[]) ?? []).map((m) => ({
      ...m,
      role: roleMap.get(m.id),
    }));
    setMembers(memberList);
    setLoading(false);

    const entries = await Promise.all(
      allF
        .filter((fr) => !fr.archived_at)
        .map(async (fr) => {
          const ids = memberList.filter((m) => m.franchise_id === fr.id).map((m) => m.id);
          return [fr.id, await getPillarScoresForUsers(ids)] as const;
        }),
    );

    setScoresByFranchise(Object.fromEntries(entries));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const visible = franchises.filter((f) => (showArchived ? !!f.archived_at : !f.archived_at));

  async function archive(id: string, name: string) {
    if (
      !confirm(
        `Archive "${name}"? Members will be detached. You can restore for 30 days; after that it can be permanently deleted.`,
      )
    ) {
      return;
    }

    const { error } = await supabase.rpc("archive_franchise", { _franchise_id: id });
    if (error) return toast.error(error.message);

    toast.success("Franchise archived");
    load();
  }

  async function restore(id: string) {
    const { error } = await supabase.rpc("restore_franchise", { _franchise_id: id });
    if (error) return toast.error(error.message);

    toast.success("Franchise restored");
    load();
  }

  async function purge(id: string, name: string, force: boolean) {
    const msg = force
      ? `Permanently delete "${name}" RIGHT NOW? This cannot be undone.`
      : `Permanently delete "${name}"? This cannot be undone.`;

    if (!confirm(msg)) return;

    const { error } = await supabase.rpc("purge_franchise", {
      _franchise_id: id,
      _force: force,
    });
    if (error) return toast.error(error.message);

    toast.success("Franchise deleted permanently");
    load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Franchises &amp; team</h1>
          <p className="text-sm text-muted-foreground">
            Create franchises, invite incharges &amp; members. Archived franchises can be
            restored within 30 days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived
              ? "Show active"
              : `Show archived (${franchises.filter((f) => f.archived_at).length})`}
          </Button>
          <NewFranchiseDialog
            onCreated={load}
            open={franchiseOpen}
            onOpenChange={setFranchiseOpen}
          />
          <NewInviteDialog
            franchises={franchises.filter((f) => !f.archived_at)}
            onCreated={load}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {showArchived ? "Archived" : "Franchises"} ({visible.length})
        </h2>
        {visible.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {showArchived ? (
                "Nothing archived."
              ) : (
                <>
                  No franchises yet.{" "}
                  <button
                    type="button"
                    onClick={() => setFranchiseOpen(true)}
                    className="font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    Create your first one
                  </button>{" "}
                  to start adding members.
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((f) => {
              const team = members.filter((m) => m.franchise_id === f.id);
              const memberCount = team.filter((m) => m.role === "member").length;
              const incharge =
                team.find((m) => m.id === f.manager_id) ?? team.find((m) => m.role === "incharge");
              const scores = scoresByFranchise[f.id];
              const isArchived = !!f.archived_at;
              const purgeReady =
                isArchived &&
                !!f.archived_at &&
                new Date(f.archived_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;

              const cardBody = (
                <>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-accent" /> {f.name}
                      </CardTitle>
                      {isArchived && <Badge variant="destructive">Archived</Badge>}
                    </div>
                    {f.location && (
                      <CardDescription className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> {f.location}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {!isArchived && scores && (
                      <div className="flex justify-center">
                        <PillarFlower scores={scores} size={180} showLabels={false} />
                      </div>
                    )}

                    <div className="space-y-1.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span className="truncate">
                          {incharge ? incharge.full_name ?? "Unnamed incharge" : "No incharge yet"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {memberCount} member
                        {memberCount === 1 ? "" : "s"}
                      </div>
                    </div>

                    {!isArchived && (
                      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-accent transition-all duration-200 group-hover:border-accent/50 group-hover:bg-accent/10">
                        <span>Click for more details</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                      </div>
                    )}
                  </CardContent>
                </>
              );

              const actionFooter = (
                <div className="space-y-2 border-t border-border/60 px-6 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!isArchived ? (
                      <Button size="sm" variant="outline" onClick={() => archive(f.id, f.name)}>
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => restore(f.id)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                        {purgeReady ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => purge(f.id, f.name, false)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete forever
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => purge(f.id, f.name, true)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Force delete
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {isArchived && f.auto_delete_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Auto-purge after {new Date(f.auto_delete_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );

              if (isArchived) {
                return (
                  <Card key={f.id} className="opacity-70">
                    {cardBody}
                    {actionFooter}
                  </Card>
                );
              }

              return (
                <Card
                  key={f.id}
                  className="group overflow-hidden p-0 transition-all duration-200 hover:border-accent/50 hover:shadow-lg focus-within:border-accent/50"
                >
                  <Link
                    to="/ceo/franchises/$id"
                    params={{ id: f.id }}
                    preload="intent"
                    className="block cursor-pointer rounded-t-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {cardBody}
                  </Link>
                  {actionFooter}
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
              No invites yet. Click{" "}
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                New invite
              </button>{" "}
              to send one.
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

function NewFranchiseDialog({
  onCreated,
  open: controlledOpen,
  onOpenChange,
}: {
  onCreated: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
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
  open: controlledOpen,
  onOpenChange,
}: {
  franchises: Franchise[];
  onCreated: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
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
