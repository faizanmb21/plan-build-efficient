import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, BadgeCheck, Globe2, Save, UserPlus, Copy, RefreshCw, Mail } from "lucide-react";
import { toast } from "sonner";
import { createQaAccount, listQaReviewers } from "@/server/create-qa-account";

export const Route = createFileRoute("/ceo/qa")({
  component: CeoQaPage,
});

type Qa = { id: string; full_name: string | null; email: string | null };
type Franchise = { id: string; name: string };

function randomPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%^&*";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len - 2; i++) out += chars[buf[i] % chars.length];
  out += symbols[buf[len - 2] % symbols.length];
  out += String(buf[len - 1] % 10);
  return out;
}

function CeoQaPage() {
  const [qas, setQas] = React.useState<Qa[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [assignments, setAssignments] = React.useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<{ email: string; password: string; name: string } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const listQa = useServerFn(listQaReviewers);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token ?? "";
    const [{ data: fr }, listRes] = await Promise.all([
      supabase.from("franchises").select("id,name").is("archived_at", null).order("name"),
      token
        ? listQa({ data: { accessToken: token } }).catch(() => ({ ok: false as const, error: "load failed", reviewers: [] }))
        : Promise.resolve({ ok: false as const, error: "no session", reviewers: [] }),
    ]);
    setFranchises(fr ?? []);

    if ((listRes as any)?.ok) {
      const reviewers = (listRes as any).reviewers as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        franchiseIds: string[];
      }>;
      setQas(reviewers.map((r) => ({ id: r.id, full_name: r.full_name, email: r.email })));
      const map: Record<string, Set<string>> = {};
      for (const r of reviewers) map[r.id] = new Set(r.franchiseIds);
      setAssignments(map);
    } else {
      setQas([]);
      setAssignments({});
    }
    setLoading(false);
  }, [listQa]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggle = (qaId: string, franchiseId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      const set = new Set(next[qaId] ?? []);
      if (set.has(franchiseId)) set.delete(franchiseId);
      else set.add(franchiseId);
      next[qaId] = set;
      return next;
    });
  };

  const save = async (qaId: string) => {
    setSavingId(qaId);
    const wanted = assignments[qaId] ?? new Set<string>();
    const { data: current } = await supabase
      .from("qa_franchise_assignments")
      .select("franchise_id")
      .eq("user_id", qaId);
    const currentSet = new Set((current ?? []).map((r) => r.franchise_id));
    const toAdd = [...wanted].filter((f) => !currentSet.has(f));
    const toRemove = [...currentSet].filter((f) => !wanted.has(f));

    if (toAdd.length) {
      const { error } = await supabase
        .from("qa_franchise_assignments")
        .insert(toAdd.map((fid) => ({ user_id: qaId, franchise_id: fid })));
      if (error) { toast.error(error.message); setSavingId(null); return; }
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("qa_franchise_assignments")
        .delete()
        .eq("user_id", qaId)
        .in("franchise_id", toRemove);
      if (error) { toast.error(error.message); setSavingId(null); return; }
    }
    toast.success("QA franchise scope updated");
    setSavingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight">QA reviewers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create QA logins and scope each one to specific centres. A QA with{" "}
            <span className="font-medium text-foreground">no franchises</span> selected can review submissions{" "}
            <span className="font-medium text-foreground">across the whole organization</span>.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Create QA login
        </Button>
      </header>

      <CreateQaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        franchises={franchises}
        onCreated={(c) => { setCreds(c); load(); }}
      />

      {creds && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">QA login ready</CardTitle>
            <CardDescription>
              Share these credentials with {creds.name}. They'll be asked to set a new password on first sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{creds.email}</code>
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{creds.password}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Hi ${creds.name}, your IRM Academy QA login:\nEmail: ${creds.email}\nPassword: ${creds.password}\nYou'll be asked to set a new password on first sign in.`,
                  );
                  toast.success("Shareable message copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy share message
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreds(null)}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : qas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No QA reviewers yet. Click <span className="text-foreground font-medium">Create QA login</span> above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {qas.map((qa) => {
            const set = assignments[qa.id] ?? new Set();
            const orgWide = set.size === 0;
            return (
              <Card key={qa.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BadgeCheck className="h-4 w-4 text-primary" />
                      {qa.full_name ?? "QA reviewer"}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-3">
                      {qa.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" /> {qa.email}
                        </span>
                      )}
                      {orgWide ? (
                        <span className="inline-flex items-center gap-1">
                          <Globe2 className="h-3.5 w-3.5" /> Org-wide access
                        </span>
                      ) : (
                        <span>Scoped to {set.size} centre{set.size === 1 ? "" : "s"}</span>
                      )}
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => save(qa.id)} disabled={savingId === qa.id}>
                    {savingId === qa.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {franchises.map((f) => {
                      const checked = set.has(f.id);
                      return (
                        <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40">
                          <Checkbox checked={checked} onCheckedChange={() => toggle(qa.id, f.id)} />
                          <span className="text-sm">{f.name}</span>
                          {checked && <Badge variant="secondary" className="ml-auto">assigned</Badge>}
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateQaDialog({
  open,
  onOpenChange,
  franchises,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  franchises: Franchise[];
  onCreated: (c: { email: string; password: string; name: string }) => void;
}) {
  const [name, setName] = React.useState("");
  const [orgWide, setOrgWide] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const create = useServerFn(createQaAccount);

  React.useEffect(() => {
    if (open) {
      setName("");
      setOrgWide(false);
      setSelected(new Set());
    }
  }, [open]);

  const generatedEmail = React.useMemo(() => {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 24);
    const rand = Math.random().toString(36).slice(2, 6);
    const base = slug ? `qa.${slug}` : "qa.reviewer";
    return `${base}.${rand}@irmacademy.qa`;
  }, [name, open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!orgWide && selected.size === 0) {
      toast.error("Pick at least one centre, or check Org-wide access");
      return;
    }
    setSubmitting(true);
    try {
      const r = (await create({
        data: {
          email: generatedEmail,
          fullName: name.trim(),
          franchiseIds: orgWide ? [] : [...selected],
        },
      })) as { ok: true; email: string; password: string } | { ok: false; error: string };
      if (!r.ok) {
        toast.error(r.error);
      } else {
        toast.success("QA login created");
        onCreated({ email: r.email, password: r.password, name: name.trim() });
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create QA login</DialogTitle>
          <DialogDescription>
            Choose which centre(s) this QA can review. A temporary password is generated — they'll be prompted to change it on first sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="qa-name">Full name</Label>
            <Input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha Khan" />
          </div>
          <div className="grid gap-2">
            <Label>Generated email</Label>
            <code className="rounded bg-muted px-3 py-2 font-mono text-xs">{generatedEmail}</code>
            <p className="text-xs text-muted-foreground">
              Email and a secure password are generated automatically. You'll see both once the account is created so you can share them with the QA.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Centre access</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40">
              <Checkbox checked={orgWide} onCheckedChange={(v) => { setOrgWide(!!v); if (v) setSelected(new Set()); }} />
              <Globe2 className="h-4 w-4" />
              <span className="text-sm font-medium">Org-wide (all centres)</span>
            </label>
            <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${orgWide ? "pointer-events-none opacity-50" : ""}`}>
              {franchises.map((f) => {
                const checked = selected.has(f.id);
                return (
                  <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40">
                    <Checkbox checked={checked} onCheckedChange={() => toggle(f.id)} />
                    <span className="text-sm">{f.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
