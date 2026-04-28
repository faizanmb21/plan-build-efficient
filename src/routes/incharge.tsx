import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LayoutDashboard, FileCheck, Activity, Users, GraduationCap, Send, FolderKanban } from "lucide-react";

const nav: NavItem[] = [
  { to: "/incharge", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incharge/members", label: "Members", icon: Users },
  { to: "/incharge/assign", label: "Assign courses", icon: Send },
  { to: "/incharge/projects", label: "Projects", icon: FolderKanban },
  { to: "/incharge/grades", label: "Grades", icon: GraduationCap },
  { to: "/incharge/attendance", label: "Attendance", icon: Activity },
  { to: "/incharge/reviews", label: "Submissions", icon: FileCheck },
];

export const Route = createFileRoute("/incharge")({
  component: InchargeLayout,
  errorComponent: InchargeError,
});

function InchargeError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load this page</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error?.message || "An unexpected error occurred."}
      </p>
      <Button
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

function InchargeLayout() {
  // CEOs can view the Incharge area for monitoring/preview purposes,
  // without switching accounts.
  return (
    <RoleGuard allow={["incharge", "ceo"]}>
      <AppShell nav={nav} roleLabel="Incharge">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
