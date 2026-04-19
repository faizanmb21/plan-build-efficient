import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Award, Activity } from "lucide-react";

const nav: NavItem[] = [
  { to: "/member", label: "My Courses", icon: LayoutDashboard },
  { to: "/member/focus", label: "Focus", icon: Activity },
  { to: "/member/grades", label: "Grades", icon: Award },
];

export const Route = createFileRoute("/member")({
  component: MemberLayout,
});

function MemberLayout() {
  return (
    <RoleGuard allow={["member"]}>
      <AppShell nav={nav} roleLabel="Member">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
