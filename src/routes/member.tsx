import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Award, Activity, FolderKanban, TrendingUp, Eye, X, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGradeNotifications } from "@/hooks/use-grade-notifications";
import { WorkSessionProvider } from "@/hooks/use-work-session";
import { DayReportModal } from "@/components/day-report/DayReportModal";
import { Button } from "@/components/ui/button";

const nav: NavItem[] = [
  { to: "/member", label: "My Courses", icon: LayoutDashboard },
  { to: "/member/today", label: "Today", icon: FileText },
  { to: "/member/progress", label: "My Progress", icon: TrendingUp },
  { to: "/member/projects", label: "Projects", icon: FolderKanban },
  { to: "/member/focus", label: "Focus", icon: Activity },
  { to: "/member/grades", label: "Grades", icon: Award },
];

export const Route = createFileRoute("/member")({
  component: MemberLayout,
});

function MemberLayout() {
  const { user, profile, roles, viewAsMemberId, setViewAsMemberId } = useAuth();
  useGradeNotifications(user?.id);
  const navigate = useNavigate();
  const isCeo = roles.includes("ceo");
  const previewing = isCeo && !!viewAsMemberId;
  const inIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const allow = inIframe || previewing
    ? (["member", "ceo"] as const)
    : (["member"] as const);

  const banner = previewing ? (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-accent" />
        Viewing as Member —{" "}
        <strong>{profile?.full_name ?? "…"}</strong>
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setViewAsMemberId(null);
          navigate({ to: "/ceo" });
        }}
      >
        <X className="h-3.5 w-3.5" /> Exit
      </Button>
    </div>
  ) : null;

  return (
    <RoleGuard allow={[...allow]}>
      {inIframe ? (
        <div className="min-h-screen bg-background">
          {banner}
          <Outlet />
        </div>
      ) : previewing ? (
        <AppShell nav={nav} roleLabel="Member (preview)">
          {banner}
          <Outlet />
        </AppShell>
      ) : (
        <WorkSessionProvider>
          <AppShell nav={nav} roleLabel="Member">
            <Outlet />
          </AppShell>
          <DayReportModal />
        </WorkSessionProvider>
      )}
    </RoleGuard>
  );
}
