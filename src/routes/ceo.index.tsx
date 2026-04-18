import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, BookOpen, Users, FileCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ceo/")({
  component: CeoDashboard,
});

interface Stats {
  franchises: number;
  courses: number;
  members: number;
  pendingSubmissions: number;
}

function CeoDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = React.useState<Stats | null>(null);

  React.useEffect(() => {
    (async () => {
      const [f, c, m, s] = await Promise.all([
        supabase.from("franchises").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      setStats({
        franchises: f.count ?? 0,
        courses: c.count ?? 0,
        members: m.count ?? 0,
        pendingSubmissions: s.count ?? 0,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">Here's a quick look at your academy.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Franchises" value={stats?.franchises} icon={Building2} />
        <StatCard label="Courses" value={stats?.courses} icon={BookOpen} />
        <StatCard label="Users" value={stats?.members} icon={Users} />
        <StatCard label="Pending grading" value={stats?.pendingSubmissions} icon={FileCheck} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}

// Bootstrap helper rendered when no role exists
export function ClaimCeoCard({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = React.useState(false);
  async function claim() {
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_first_ceo");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("A CEO already exists. Ask them to invite you.");
      return;
    }
    toast.success("You're now the CEO");
    onClaimed();
  }
  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" /> Bootstrap your academy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          No CEO exists yet for this academy. Click below to claim the CEO role for your account.
          (This only works once.)
        </p>
        <Button onClick={claim} disabled={busy}>
          {busy ? "Claiming…" : "Claim CEO role"}
        </Button>
      </CardContent>
    </Card>
  );
}
