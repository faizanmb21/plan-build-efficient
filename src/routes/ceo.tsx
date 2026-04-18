import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Building2, BookOpen, Send, FileCheck, Sparkles } from "lucide-react";

const nav: NavItem[] = [
  { to: "/ceo", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ceo/franchises", label: "Franchises", icon: Building2 },
  { to: "/ceo/courses", label: "Courses", icon: BookOpen },
  { to: "/ceo/assign", label: "Assign", icon: Send },
  { to: "/ceo/submissions", label: "Submissions", icon: FileCheck },
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
