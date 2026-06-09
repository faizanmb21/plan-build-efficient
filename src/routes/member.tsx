import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Award, Activity, FolderKanban, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGradeNotifications } from "@/hooks/use-grade-notifications";
import { WorkSessionProvider } from "@/hooks/use-work-session";
import { SessionPausedOverlay } from "@/components/work/SessionPausedOverlay";
import { IdleWarningModal } from "@/components/work/IdleWarningModal";

const nav: NavItem[] = [
  { to: "/member", label: "My Courses", icon: LayoutDashboard },
  { to: "/member/progress", label: "My Progress", icon: TrendingUp },
  { to: "/member/projects", label: "Projects", icon: FolderKanban },
  { to: "/member/focus", label: "Focus", icon: Activity },
  { to: "/member/grades", label: "Grades", icon: Award },
];

export const Route = createFileRoute("/member")({
  component: MemberLayout,
});

function MemberLayout() {
  const { user } = useAuth();
  useGradeNotifications(user?.id);
  const inIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const allow = inIframe ? (["member", "ceo"] as const) : (["member"] as const);
  return (
    <RoleGuard allow={[...allow]}>
      {inIframe ? (
        <div className="min-h-screen bg-background">
          <Outlet />
        </div>
      ) : (
        <WorkSessionProvider>
          <AppShell nav={nav} roleLabel="Member">
            <Outlet />
          </AppShell>
          <SessionPausedOverlay />
          <IdleWarningModal />
        </WorkSessionProvider>
      )}
    </RoleGuard>
  );
}

