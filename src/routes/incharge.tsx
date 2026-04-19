import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, ClipboardList, Activity } from "lucide-react";

const nav: NavItem[] = [
  { to: "/incharge", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incharge/attendance", label: "Attendance", icon: Activity },
  { to: "/incharge/reviews", label: "Reviews", icon: ClipboardList },
];

export const Route = createFileRoute("/incharge")({
  component: InchargeLayout,
});

function InchargeLayout() {
  return (
    <RoleGuard allow={["incharge"]}>
      <AppShell nav={nav} roleLabel="Incharge">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
