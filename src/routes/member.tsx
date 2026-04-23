import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Award, Activity, FolderKanban } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGradeNotifications } from "@/hooks/use-grade-notifications";

const nav: NavItem[] = [
  { to: "/member", label: "My Courses", icon: LayoutDashboard },
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
  return (
    <RoleGuard allow={["member"]}>
      <AppShell nav={nav} roleLabel="Member">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
