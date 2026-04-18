import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth, homeForRole } from "@/lib/auth";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { loading, session, primaryRole } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    navigate({ to: homeForRole(primaryRole) });
  }, [loading, session, primaryRole, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <GraduationCap className="h-10 w-10 text-primary" />
        <p className="text-sm">Loading IRM Academy…</p>
      </div>
    </div>
  );
}
