import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  createUserAccount,
  adminResetPassword,
  listTeam,
  deleteUserAccount,
} from "@/lib/admin-users.functions";
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
  Copy,
  Trash2,
  Users,
  Archive,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Info,
  KeyRound,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { GradePieCard } from "@/components/grading/GradePieCard";
import { fetchGradeSummaries, combineAggregates } from "@/lib/grade-summary";
import { emptyAggregate, type GradeAggregate } from "@/lib/grade-utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BulkCreateAccountsDialog } from "@/components/ceo/BulkCreateAccountsDialog";

interface Franchise {
  id: string;
  name: string;
  location: string | null;
  manager_id: string | null;
  created_at: string;
  archived_at: string | null;
  auto_delete_at: string | null;
}

interface MemberRow {
  id: string;
  full_name: string | null;
  franchise_id: string | null;
  role?: string;
}

type TeamMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  franchise_id: string | null;
  roles: string[];
  created_at: string;
};

function generatePassword(): string {
  // 12-char password with letters, digits and a couple of symbols — easy to share
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

export function FranchisesAndInvitesSection() {
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [team, setTeam] = React.useState<TeamMember[]>([]);
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showArchived, setShowArchived] = React.useState(false);
  const [aggsByFranchise, setAggsByFranchise] = React.useState<Record<string, GradeAggregate>>({});
  const [franchiseOpen, setFranchiseOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const listTeamFn = useServerFn(listTeam);

  const load = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    const [f, p, r, t] = await Promise.all([
      supabase.from("franchises").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, franchise_id"),
      supabase.from("user_roles").select("user_id, role"),
      listTeamFn({ data: { accessToken } }).catch(() => ({ ok: false as const, members: [], error: "" })),
    ]);

    const allF = (f.data as Franchise[]) ?? [];
    setFranchises(allF);
    setTeam(t.ok ? (t.members as TeamMember[]) : []);

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

    const memberRoleSet = new Set(
      ((r.data as { user_id: string; role: string }[]) ?? [])
        .filter((x) => x.role === "member")
        .map((x) => x.user_id),
    );
    const allMemberIds = memberList
      .filter((m) => memberRoleSet.has(m.id))
      .map((m) => m.id);
    const summaries = await fetchGradeSummaries(allMemberIds);

    const entries = allF
      .filter((fr) => !fr.archived_at)
      .map((fr) => {
        const ids = memberList
          .filter((m) => m.franchise_id === fr.id && memberRoleSet.has(m.id))
          .map((m) => m.id);
        const aggs = ids.map((id) => summaries.get(id) ?? emptyAggregate());
        return [fr.id, combineAggregates(aggs)] as const;
      });

    setAggsByFranchise(Object.fromEntries(entries));
  }, [listTeamFn]);

  React.useEffect(() => {
    load();
  }, [load]);

  const confirm = useConfirm();

  const visible = franchises.filter((f) => (showArchived ? !!f.archived_at : !f.archived_at));

  async function restore(id: string) {
    const { error } = await supabase.rpc("restore_franchise", { _franchise_id: id });
    if (error) return toast.error(error.message);
    toast.success("Franchise restored");
    load();
  }

  async function purge(id: string, name: string, force: boolean) {
    const ok = await confirm({
      title: force ? "Delete RIGHT NOW?" : "Delete franchise?",
      description: force
        ? `Permanently delete "${name}" RIGHT NOW? This cannot be undone.`
        : `Permanently delete "${name}"? This cannot be undone.`,
      confirmLabel: "Delete permanently",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("purge_franchise", {
      _franchise_id: id,
      _force: force,
    });
    if (error) return toast.error(error.message);
    toast.success("Franchise deleted permanently");
    load();
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {showArchived ? `Archived (${visible.length})` : "Team & franchises"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Create franchises and team accounts directly — share the temporary password
              with the person, they change it on first sign-in.
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
            <CreateAccountDialog
              franchises={franchises.filter((f) => !f.archived_at)}
              onCreated={load}
              open={createOpen}
              onOpenChange={setCreateOpen}
              callerScope="ceo"
            />
            <BulkCreateAccountsDialog
              franchises={franchises.filter((f) => !f.archived_at)}
              onCreated={load}
              callerScope="ceo"
            />
          </div>
        </div>

        {!showArchived ? null : visible.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nothing archived.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((f) => {
              const memberCount = members.filter(
                (m) => m.franchise_id === f.id && m.role === "member",
              ).length;
              const incharge =
                members.find((m) => m.id === f.manager_id) ??
                members.find((m) => m.franchise_id === f.id && m.role === "incharge");
              const agg = aggsByFranchise[f.id];
              const isArchived = !!f.archived_at;
              const purgeReady =
                isArchived &&
                !!f.archived_at &&
                new Date(f.archived_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;

              return (
                <Card key={f.id} className="opacity-70">
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
                    {!isArchived && agg && (
                      <div className="flex justify-center">
                        <GradePieCard agg={agg} size={150} showStats={false} />
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
                  </CardContent>
                  <div className="space-y-2 border-t border-border/60 px-6 py-3">
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                    {f.auto_delete_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Auto-purge after {new Date(f.auto_delete_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <TeamList
        team={team}
        franchises={franchises}
        onChanged={load}
      />
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

export function CreateAccountDialog({
  franchises,
  onCreated,
  open: controlledOpen,
  onOpenChange,
  callerScope,
  lockFranchiseId = null,
  triggerLabel,
}: {
  franchises: { id: string; name: string }[];
  onCreated: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  callerScope: "ceo" | "incharge";
  lockFranchiseId?: string | null;
  triggerLabel?: string;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<"ceo" | "incharge" | "member" | "qa">(
    callerScope === "incharge" ? "member" : "member",
  );
  const [franchiseId, setFranchiseId] = React.useState<string>(lockFranchiseId ?? "");
  const [expectedHours, setExpectedHours] = React.useState<string>("");
  const DAY_OPTIONS = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ] as const;
  const [workingDays, setWorkingDays] = React.useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{
    email: string;
    password: string;
    fullName: string;
    role: string;
  } | null>(null);

  const needsFranchise = role !== "ceo" && role !== "qa";
  const franchiseSatisfied = !needsFranchise || !!lockFranchiseId || !!franchiseId;
  const effectiveFranchiseId = lockFranchiseId ?? franchiseId;
  const canSubmit = franchiseSatisfied && fullName.trim().length > 0 && !busy;

  const createFn = useServerFn(createUserAccount);

  function slug(str: string, max = 24) {
    return str
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, max);
  }

  function deriveEmail(): string {
    const firstNameRaw = fullName.trim().split(/\s+/)[0] ?? "";
    let first = slug(firstNameRaw);
    if (!first) first = `user${Math.floor(1000 + Math.random() * 9000)}`;
    const suffix = Math.random().toString(36).slice(2, 6);
    if (role === "ceo" || role === "qa") {
      return `${role}.${first}.${suffix}@irmacademy.app`;
    }
    const franchiseName =
      franchises.find((f) => f.id === effectiveFranchiseId)?.name ?? "";
    const franchiseSlug = slug(franchiseName) || "franchise";
    return `${role}.${first}.${franchiseSlug}.${suffix}@irmacademy.app`;
  }

  function reset() {
    setFullName("");
    setRole(callerScope === "incharge" ? "member" : "member");
    setFranchiseId(lockFranchiseId ?? "");
    setExpectedHours("");
    setWorkingDays(["mon", "tue", "wed", "thu", "fri"]);
    setResult(null);
  }

  function buildShareText(em: string, pw: string, name: string) {
    return `IRM Academy login\n\nName: ${name}\nEmail: ${em}\nTemporary password: ${pw}\n\nSign in at ${window.location.origin}/login — you'll be asked to change your password on first sign-in.`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        setBusy(false);
        toast.error("Your session has expired. Please sign in again.");
        return;
      }
      const email = deriveEmail();
      const password = generatePassword();
      const res = await createFn({
        data: {
          email,
          password,
          fullName: fullName.trim(),
          role,
          franchiseId:
            role === "ceo" || role === "qa"
              ? null
              : (lockFranchiseId ?? franchiseId) || null,
          accessToken,
        },
      });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Account created");
      setResult({
        email: res.email,
        password: res.password,
        fullName: res.fullName,
        role: res.role,
      });
      onCreated();
    } catch (err: any) {
      setBusy(false);
      console.error("Create account failed:", err);
      toast.error(err?.message || "Failed to create account");
    }
  }

  function copyAll() {
    if (!result) return;
    navigator.clipboard.writeText(
      buildShareText(result.email, result.password, result.fullName),
    );
    toast.success("Credentials copied — paste in WhatsApp/email");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> {triggerLabel ?? "Create account"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created — share these credentials</DialogTitle>
              <DialogDescription>
                Send this to {result.fullName}. They'll be prompted to change the password
                on first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm font-mono space-y-1">
              <div>Email: {result.email}</div>
              <div>Password: {result.password}</div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copyAll}>
                <Copy className="h-4 w-4" /> Copy share-text
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create account</DialogTitle>
              <DialogDescription>
                Set the user's email and a temporary password — they'll change it on first
                sign-in. No invite link is sent.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              {callerScope === "ceo" && (
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={role}
                    onValueChange={(v) => {
                      setRole(v as "ceo" | "incharge" | "member" | "qa");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member (learner)</SelectItem>
                      <SelectItem value="incharge">Incharge (franchise manager)</SelectItem>
                      <SelectItem value="qa">QA (org-wide grader)</SelectItem>
                      <SelectItem value="ceo">CEO (full admin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {needsFranchise && !lockFranchiseId && (
                <div className="space-y-1.5">
                  <Label>
                    Franchise <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={franchiseId}
                    onValueChange={(v) => setFranchiseId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select franchise" />
                    </SelectTrigger>
                    <SelectContent>
                      {franchises.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Required — credentials are scoped to this franchise.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Full name</Label>
                <Input
                  id="acc-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Faizan Ahmed"
                  required
                />
              </div>

              <p className="text-xs text-muted-foreground">
                A unique email and a secure temporary password will be generated
                automatically. Both will appear here for you to copy
                <strong> after</strong> you click <em>Create account</em>.
              </p>

              <DialogFooter>
                <Button type="submit" disabled={!canSubmit}>
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </DialogFooter>
            </form>


          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamList({
  team,
  franchises,
  onChanged,
}: {
  team: TeamMember[];
  franchises: Franchise[];
  onChanged: () => void;
}) {
  const franchiseName = (id: string | null) =>
    id ? franchises.find((f) => f.id === id)?.name ?? "—" : "—";
  const [filter, setFilter] = React.useState<string>("all");

  const filtered = team.filter((m) => {
    if (filter === "all") return true;
    if (filter === "no-role") return m.roles.length === 0;
    return m.roles.includes(filter);
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          People ({team.length})
        </h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="ceo">CEO</SelectItem>
            <SelectItem value="incharge">Incharge</SelectItem>
            <SelectItem value="qa">QA</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="no-role">No role</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          You can reset a user's password here. The new temporary password is shown once — copy
          it and share it via WhatsApp/email. The user is forced to change it on next sign-in.
        </p>
      </div>
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No matching users.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((m) => (
                <TeamRow
                  key={m.id}
                  member={m}
                  franchiseName={franchiseName(m.franchise_id)}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function TeamRow({
  member,
  franchiseName,
  onChanged,
}: {
  member: TeamMember;
  franchiseName: string;
  onChanged: () => void;
}) {
  const [resetOpen, setResetOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [newPw, setNewPw] = React.useState(() => generatePassword());
  const [done, setDone] = React.useState(false);
  const confirm = useConfirm();
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(deleteUserAccount);

  async function doReset() {
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
    toast.success("Password reset — share the new one");
  }

  function copyShare() {
    const text = `IRM Academy login\n\nName: ${member.full_name ?? ""}\nEmail: ${member.email ?? ""}\nNew temporary password: ${newPw}\n\nSign in at ${window.location.origin}/login — you'll be asked to change your password.`;
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function removeUser() {
    const ok = await confirm({
      title: "Remove from franchise?",
      description: `Detach ${member.full_name ?? member.email ?? "this user"} from their franchise? Their account stays.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("remove_member_from_franchise", { _user_id: member.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      onChanged();
    }
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete account permanently?",
      description: `Permanently delete ${member.full_name ?? member.email ?? "this account"}? This removes their login, profile and roles. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      variant: "destructive",
    });
    if (!ok) return;
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      toast.error("Your session has expired. Please sign in again.");
      return;
    }
    try {
      const res = await deleteFn({ data: { userId: member.id, accessToken } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Account deleted");
      onChanged();
    } catch (err: any) {
      console.error("Delete account failed:", err);
      toast.error(err?.message || "Failed to delete account");
    }
  }


  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{member.full_name ?? "Unnamed"}</span>
          {member.roles.length === 0 ? (
            <Badge variant="outline">No role</Badge>
          ) : (
            member.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r}
              </Badge>
            ))
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {member.email ?? "no email"} · {franchiseName}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Dialog
          open={resetOpen}
          onOpenChange={(o) => {
            setResetOpen(o);
            if (!o) {
              setNewPw(generatePassword());
              setDone(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <KeyRound className="h-3.5 w-3.5" /> Reset password
            </Button>
          </DialogTrigger>
          <DialogContent>
            {done ? (
              <>
                <DialogHeader>
                  <DialogTitle>New temporary password</DialogTitle>
                  <DialogDescription>
                    Share this with {member.full_name ?? member.email}. They'll change it on
                    sign-in.
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
                  <Button onClick={() => setResetOpen(false)}>Done</Button>
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
                  <Button onClick={doReset} disabled={busy || newPw.length < 8}>
                    {busy ? "Resetting…" : "Reset password"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
        {member.franchise_id && (
          <Button
            size="sm"
            variant="ghost"
            onClick={removeUser}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove from franchise"
            title="Detach from franchise (keeps account)"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={deleteAccount}
          className="text-destructive hover:text-destructive"
          aria-label="Delete account"
          title="Delete account permanently"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

      </div>
    </div>
  );
}
