import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, Search, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/ceo/view-as-member")({
  component: ViewAsMemberPage,
});

type MemberRow = {
  id: string;
  full_name: string | null;
  franchise_id: string | null;
  franchise_name: string | null;
};

function ViewAsMemberPage() {
  const { setViewAsMemberId } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");

  const query = useQuery({
    queryKey: ["view-as-member", "member-list"],
    queryFn: async (): Promise<MemberRow[]> => {
      const [{ data: roleRows, error: rErr }, { data: profs, error: pErr }, { data: fr, error: fErr }] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "member"),
        supabase.from("profiles").select("id, full_name, franchise_id"),
        supabase.from("franchises").select("id, name"),
      ]);
      if (rErr) throw rErr;
      if (pErr) throw pErr;
      if (fErr) throw fErr;
      const memberIds = new Set((roleRows ?? []).map((r) => r.user_id));
      const frMap = new Map((fr ?? []).map((f) => [f.id, f.name]));
      return (profs ?? [])
        .filter((p) => memberIds.has(p.id))
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          franchise_id: p.franchise_id,
          franchise_name: p.franchise_id ? frMap.get(p.franchise_id) ?? null : null,
        }))
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    },
  });

  const filtered = React.useMemo(() => {
    const data = query.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(needle) ||
        (m.franchise_name ?? "").toLowerCase().includes(needle),
    );
  }, [query.data, q]);

  function pick(id: string) {
    setViewAsMemberId(id);
    navigate({ to: "/member" });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">View as Member</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a member to preview the Member experience exactly as they see it.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or franchise…"
          className="pl-9"
        />
      </div>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading members…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No members found.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {m.full_name ?? "Unnamed member"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.franchise_name ?? "No franchise"}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" tabIndex={-1}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
