import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Award, Activity, FolderKanban, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGradeNotifications } from "@/hooks/use-grade-notifications";

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
  // CEO is allowed into /member ONLY when rendered inside an iframe
  // (the "View as member" preview from /ceo/courses). When a CEO opens a
  // /member URL directly in their tab, send them back to /ceo so the app
  // never silently switches their role label to "Member".
  const inIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const allow = inIframe ? (["member", "ceo"] as const) : (["member"] as const);
  return (
    <RoleGuard allow={[...allow]}>
      {inIframe ? (
        // Inside the preview iframe: render just the course content,
        // no sidebar / topbar / "MEMBER" branding.
        <div className="min-h-screen bg-background">
          <Outlet />
        </div>
      ) : (
        <AppShell nav={nav} roleLabel="Member">
          <Outlet />
        </AppShell>
      )}
    </RoleGuard>
  );
}
