import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth, homeForRole } from "@/lib/auth";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { loading, session, primaryRole, roles, signOut } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (primaryRole) {
      navigate({ to: homeForRole(primaryRole) });
    }
  }, [loading, session, primaryRole, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GraduationCap className="h-10 w-10 text-primary" />
          <p className="text-sm">Loading IRM Academy…</p>
        </div>
      </div>
    );
  }

  // Authenticated but no role — show bootstrap or waiting screen
  if (!roles.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
        <div className="w-full max-w-md space-y-4">
          
          <Card>
            <CardHeader>
              <CardTitle>Waiting for an invite</CardTitle>
              <CardDescription>
                If a CEO has already been set up, ask them to send you an invite link to join your
                franchise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
