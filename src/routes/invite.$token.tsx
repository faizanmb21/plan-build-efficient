import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, homeForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

interface InviteRow {
  id: string;
  email: string;
  role: "ceo" | "incharge" | "member" | "qa";
  franchise_id: string | null;
  expires_at: string;
  accepted_at: string | null;
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const [invite, setInvite] = React.useState<InviteRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase
        .from("invites")
        .select("id,email,role,franchise_id,expires_at,accepted_at")
        .eq("token", token)
        .maybeSingle();
      if (e || !data) {
        setError("Invite not found");
      } else if (data.accepted_at) {
        setError("This invite has already been used");
      } else if (new Date(data.expires_at) < new Date()) {
        setError("This invite has expired");
      } else {
        setInvite(data as InviteRow);
      }
      setLoading(false);
    })();
  }, [token]);

  async function acceptInvite() {
    const { error: e } = await supabase.rpc("accept_invite", { _token: token });
    if (e) {
      toast.error(e.message);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      if (!session) {
        const { error: signErr } = await supabase.auth.signUp({
          email: invite.email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/invite/${token}`,
            data: { full_name: fullName },
          },
        });
        if (signErr) throw signErr;
        // Try immediate sign-in (works when email confirm is disabled)
        const { error: siErr } = await supabase.auth.signInWithPassword({
          email: invite.email,
          password,
        });
        if (siErr) {
          toast.success("Check your email to confirm, then re-open this invite.");
          return;
        }
      }
      const ok = await acceptInvite();
      if (!ok) return;
      await refresh();
      toast.success("Welcome to IRM Academy!");
      navigate({ to: homeForRole(invite.role) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptExisting() {
    setBusy(true);
    const ok = await acceptInvite();
    setBusy(false);
    if (!ok) return;
    await refresh();
    toast.success("Joined!");
    navigate({ to: invite ? homeForRole(invite.role) : "/" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading invite…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: "/login" })} className="w-full">
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join IRM Academy</CardTitle>
          <CardDescription>
            You've been invited as <span className="font-semibold capitalize">{invite?.role}</span>{" "}
            for <span className="font-semibold">{invite?.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session ? (
            <Button onClick={handleAcceptExisting} disabled={busy} className="w-full">
              {busy ? "Joining…" : "Accept invite"}
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Create password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account & join"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
