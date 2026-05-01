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
import { Loader2, BadgeCheck, Globe2, Save, UserPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { createQaAccount } from "@/server/create-qa-account";

export const Route = createFileRoute("/ceo/qa")({
  component: CeoQaPage,
});

type Qa = { id: string; full_name: string | null; email: string | null };
type Franchise = { id: string; name: string };

function CeoQaPage() {
  const [qas, setQas] = React.useState<Qa[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [assignments, setAssignments] = React.useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [creatingQa, setCreatingQa] = React.useState(false);
  const [creds, setCreds] = React.useState<{ email: string; password: string } | null>(null);
  const createQa = useServerFn(createQaAccount);

  const handleCreateQa = async () => {
    setCreatingQa(true);
    try {
      const r = (await createQa()) as
        | { ok: true; status: "created" | "reset"; email: string; password: string }
        | { ok: false; error: string };
      if (!r.ok) {
        toast.error(r.error);
      } else {
        setCreds({ email: r.email, password: r.password });
        toast.success(
          r.status === "created" ? "QA account created" : "QA account password reset",
        );
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setCreatingQa(false);
    }
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    const [{ data: qaRoles }, { data: fr }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "qa"),
      supabase.from("franchises").select("id,name").is("archived_at", null).order("name"),
    ]);

    const qaIds = (qaRoles ?? []).map((r) => r.user_id);
    if (qaIds.length === 0) {
      setQas([]);
      setFranchises(fr ?? []);
      setAssignments({});
      setLoading(false);
      return;
    }

    const [{ data: profiles }, { data: assignRows }] = await Promise.all([
      supabase.from("profiles").select("id,full_name").in("id", qaIds),
      supabase
        .from("qa_franchise_assignments")
        .select("user_id,franchise_id")
        .in("user_id", qaIds),
    ]);

    const map: Record<string, Set<string>> = {};
    qaIds.forEach((id) => (map[id] = new Set()));
    (assignRows ?? []).forEach((r) => {
      map[r.user_id]?.add(r.franchise_id);
    });

    setQas(
      qaIds.map((id) => ({
        id,
        full_name: profiles?.find((p) => p.id === id)?.full_name ?? null,
        email: null,
      })),
    );
    setFranchises(fr ?? []);
    setAssignments(map);
    setLoading(false);
  }, []);

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

    // Fetch current rows
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
      if (error) {
        toast.error(error.message);
        setSavingId(null);
        return;
      }
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("qa_franchise_assignments")
        .delete()
        .eq("user_id", qaId)
        .in("franchise_id", toRemove);
      if (error) {
        toast.error(error.message);
        setSavingId(null);
        return;
      }
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
            Restrict each QA to specific franchises. A QA with{" "}
            <span className="font-medium text-foreground">no franchises</span> selected can review
            submissions across <span className="font-medium text-foreground">the whole organization</span>.
          </p>
        </div>
        <Button onClick={handleCreateQa} disabled={creatingQa}>
          {creatingQa ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Create demo QA login
        </Button>
      </header>

      {creds && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">QA login ready</CardTitle>
            <CardDescription>
              Sign out and log back in with these credentials to access the QA dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{creds.email}</code>
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{creds.password}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${creds.email}\t${creds.password}`);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
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
            No QA reviewers yet. Invite one from the Franchises page.
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
                    <CardDescription>
                      {orgWide ? (
                        <span className="inline-flex items-center gap-1">
                          <Globe2 className="h-3.5 w-3.5" /> Org-wide access
                        </span>
                      ) : (
                        `Scoped to ${set.size} franchise${set.size === 1 ? "" : "s"}`
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => save(qa.id)}
                    disabled={savingId === qa.id}
                  >
                    {savingId === qa.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {franchises.map((f) => {
                      const checked = set.has(f.id);
                      return (
                        <label
                          key={f.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(qa.id, f.id)}
                          />
                          <span className="text-sm">{f.name}</span>
                          {checked && (
                            <Badge variant="secondary" className="ml-auto">
                              assigned
                            </Badge>
                          )}
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
