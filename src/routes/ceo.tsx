import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Building2, BookOpen, Send, FileCheck, Sparkles, Activity, GraduationCap, FolderKanban, ShieldCheck } from "lucide-react";

const nav: NavItem[] = [
  { to: "/ceo", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ceo/franchises", label: "Franchises", icon: Building2 },
  { to: "/ceo/courses", label: "Courses", icon: BookOpen },
  { to: "/ceo/assign", label: "Assign", icon: Send },
  { to: "/ceo/projects", label: "Projects", icon: FolderKanban },
  { to: "/ceo/attendance", label: "Attendance", icon: Activity },
  { to: "/ceo/submissions", label: "Submissions", icon: FileCheck },
  { to: "/ceo/grades", label: "Grades", icon: GraduationCap },
  { to: "/incharge", label: "View as Incharge", icon: ShieldCheck },
  { to: "/ceo/seed", label: "Seed demo data", icon: Sparkles },
];

export const Route = createFileRoute("/ceo")({
  component: CeoLayout,
});

function CeoLayout() {
  return (
    <RoleGuard allow={["ceo"]}>
      <AppShell nav={nav} roleLabel="CEO">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
