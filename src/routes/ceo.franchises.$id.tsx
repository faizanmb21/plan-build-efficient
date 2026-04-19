import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Users, Mail, Phone, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PillarFlower } from "@/components/PillarFlower";
import { getPillarScoresForUsers } from "@/lib/pillar-data";
import type { PillarScores } from "@/lib/pillars";

export const Route = createFileRoute("/ceo/franchises/$id")({
  component: FranchiseDetailPage,
});

interface Franchise {
  id: string;
  name: string;
  location: string | null;
  manager_id: string | null;
  created_at: string;
  archived_at: string | null;
}

interface MemberDetail {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: "ceo" | "incharge" | "member" | undefined;
  email?: string | null;
  scores?: PillarScores;
}

function FranchiseDetailPage() {
  const { id } = Route.useParams();
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [manager, setManager] = React.useState<MemberDetail | null>(null);
  const [members, setMembers] = React.useState<MemberDetail[]>([]);
  const [orgScores, setOrgScores] = React.useState<PillarScores | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: profs }, { data: roles }] = await Promise.all([
      supabase.from("franchises").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("id, full_name, phone, franchise_id").eq("franchise_id", id),
      supabase.from("user_roles").select("user_id, role").eq("franchise_id", id),
    ]);

    setFranchise((f as Franchise | null) ?? null);

    const roleMap = new Map<string, "ceo" | "incharge" | "member">();
    ((roles as { user_id: string; role: "ceo" | "incharge" | "member" }[]) ?? []).forEach((r) =>
      roleMap.set(r.user_id, r.role),
    );

    const allUserIds = ((profs as { id: string }[]) ?? []).map((p) => p.id);
    const memberOnlyIds = allUserIds.filter((uid) => roleMap.get(uid) === "member");

    // Per-member pillar scores (members only)
    const perMemberScores = await Promise.all(
      memberOnlyIds.map(async (uid) => [uid, await getPillarScoresForUsers([uid])] as const),
    );
    const scoreMap = new Map(perMemberScores);

    const profileRows =
      (profs as { id: string; full_name: string | null; phone: string | null }[] | null) ?? [];
    const mList: MemberDetail[] = profileRows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      role: roleMap.get(p.id),
      scores: scoreMap.get(p.id),
    }));

    // Manager (incharge) — taken from franchises.manager_id, but also show
    // any incharge in this franchise even if manager_id is unset.
    const inchargeId =
      (f as Franchise | null)?.manager_id ??
      mList.find((m) => m.role === "incharge")?.id ??
      null;
    setManager(mList.find((m) => m.id === inchargeId) ?? null);
    setMembers(mList.filter((m) => m.role === "member"));

    setOrgScores(await getPillarScoresForUsers(memberOnlyIds));
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function removeMember(uid: string, name: string) {
    if (!confirm(`Remove ${name || "this member"} from the franchise?`)) return;
    const { error } = await supabase.rpc("remove_member_from_franchise", { _user_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    load();
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading franchise…</div>;
  }
  if (!franchise) {
    return (
      <div className="space-y-3">
        <Link to="/ceo/franchises">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to franchises
          </Button>
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Franchise not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/ceo/franchises">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to franchises
          </Button>
        </Link>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl font-bold tracking-tight">{franchise.name}</h1>
            {franchise.archived_at && <Badge variant="destructive">Archived</Badge>}
          </div>
          {franchise.location && (
            <p className="mt-1 text-sm text-muted-foreground">{franchise.location}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {members.length} member{members.length === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />{" "}
              {manager ? `Incharge: ${manager.full_name ?? "Unnamed"}` : "No incharge assigned"}
            </span>
          </div>
        </div>
      </header>

      {/* Franchise mastery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Franchise mastery</CardTitle>
          <CardDescription>
            12-pillar progress averaged across this franchise's members.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {orgScores ? (
            <PillarFlower scores={orgScores} size={320} showLegend />
          ) : (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No members in this franchise yet. Send an invite to add one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <Card key={m.id} className="hover-lift">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{m.full_name ?? "Unnamed"}</CardTitle>
                    <Badge variant="outline" className="capitalize">
                      {m.role ?? "member"}
                    </Badge>
                  </div>
                  {m.phone && (
                    <CardDescription className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {m.phone}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-center">
                    {m.scores ? (
                      <PillarFlower scores={m.scores} size={150} showLabels={false} />
                    ) : (
                      <div className="h-[150px]" />
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => removeMember(m.id, m.full_name ?? "")}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove from franchise
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
