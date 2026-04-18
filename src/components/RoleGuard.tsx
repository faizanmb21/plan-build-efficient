import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole, homeForRole } from "@/lib/auth";
import { GraduationCap } from "lucide-react";

export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { loading, session, roles, primaryRole } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!roles.some((r) => allow.includes(r))) {
      navigate({ to: homeForRole(primaryRole) });
    }
  }, [loading, session, roles, allow, primaryRole, navigate]);

  if (loading || !session || !roles.some((r) => allow.includes(r))) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
