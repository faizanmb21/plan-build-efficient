import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, homeForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { realUser, primaryRole, refresh, viewAsMemberId, setViewAsMemberId } = useAuth();
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!realUser) navigate({ to: "/login" });
  }, [realUser, navigate]);

  // Safety: CEO impersonating a member must not change their own password here.
  React.useEffect(() => {
    if (viewAsMemberId) setViewAsMemberId(null);
  }, [viewAsMemberId, setViewAsMemberId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.updateUser({
      password: pw,
      data: { must_change_password: false },
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      toast.error(error.message);
      return;
    }
    const stillMustChange = Boolean(
      (data.user?.user_metadata as { must_change_password?: boolean } | null)?.must_change_password,
    );
    if (stillMustChange) {
      setBusy(false);
      const msg = "Password updated but the must-change flag did not clear. Please try again.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    toast.success("Password updated");
    await refresh();
    setBusy(false);
    navigate({ to: primaryRole ? homeForRole(primaryRole) : "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            You're signed in with a temporary password. Choose a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Set password & continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
