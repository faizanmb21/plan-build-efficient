import * as React from "react";
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { LayoutDashboard, Building2, BookOpen, Send, FileCheck, Activity, GraduationCap, FolderKanban, ShieldCheck, BadgeCheck, Users, UserCircle, ArrowLeftCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { COURSE_AUTHOR_IDS } from "@/lib/access";

const fullNav: NavItem[] = [
  { to: "/ceo", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ceo/franchises", label: "Franchises", icon: Building2 },
  { to: "/ceo/members", label: "Members", icon: Users },
  { to: "/ceo/courses", label: "Courses", icon: BookOpen },
  { to: "/ceo/assign", label: "Assign", icon: Send },
  { to: "/ceo/projects", label: "Projects", icon: FolderKanban },
  { to: "/ceo/attendance", label: "Attendance", icon: Activity },
  { to: "/ceo/submissions", label: "Submissions", icon: FileCheck },
  { to: "/ceo/grades", label: "Grades", icon: GraduationCap },
  { to: "/ceo/qa", label: "QA reviewers", icon: BadgeCheck },
  { to: "/incharge", label: "View as Incharge", icon: ShieldCheck },
  { to: "/ceo/view-as-member", label: "View as Member", icon: UserCircle },
  { to: "/qa", label: "View as QA", icon: BadgeCheck },
];

// Course-author-only users (e.g. Maida) see a stripped panel with just the
// courses surface plus a way back to their own role's panel.
const authorOnlyNav: NavItem[] = [
  { to: "/ceo/courses", label: "Courses", icon: BookOpen },
  { to: "/incharge", label: "Back to Incharge", icon: ArrowLeftCircle },
];

export const Route = createFileRoute("/ceo")({
  component: CeoLayout,
});

function CeoLayout() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isCeo = roles.includes("ceo");
  const isAuthorOnly = !isCeo && !!user && COURSE_AUTHOR_IDS.includes(user.id);

  // Non-CEO authors are only allowed under /ceo/courses. If they land
  // anywhere else under /ceo, bounce them to the courses index.
  React.useEffect(() => {
    if (!isAuthorOnly) return;
    if (!location.pathname.startsWith("/ceo/courses")) {
      navigate({ to: "/ceo/courses", replace: true });
    }
  }, [isAuthorOnly, location.pathname, navigate]);

  const nav = isAuthorOnly ? authorOnlyNav : fullNav;
  const roleLabel = isAuthorOnly ? "Course author" : "CEO";

  return (
    <RoleGuard allow={["ceo"]} allowUserIds={COURSE_AUTHOR_IDS}>
      <AppShell nav={nav} roleLabel={roleLabel}>
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
