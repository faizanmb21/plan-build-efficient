import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, FileCheck } from "lucide-react";

const nav: NavItem[] = [
  { to: "/qa", label: "Dashboard", icon: LayoutDashboard },
  { to: "/qa/submissions", label: "Submissions", icon: FileCheck },
];

export const Route = createFileRoute("/qa")({
  component: QaLayout,
});

function QaLayout() {
  return (
    <RoleGuard allow={["qa", "ceo"]}>
      <AppShell nav={nav} roleLabel="QA">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
