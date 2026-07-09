import * as React from "react";
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { SectionSubNav, type SubNavTab } from "@/components/SectionSubNav";
import { LayoutDashboard, BookOpen, ClipboardCheck, Users, Settings, ArrowLeftCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { COURSE_AUTHOR_IDS } from "@/lib/access";

// 5 top-level sections. Sub-pages within a section keep their own URLs and
// are reached via the SectionSubNav rendered above the page content —
// matchPrefixes just makes the sidebar item light up on those sub-routes too.
const fullNav: NavItem[] = [
  { to: "/ceo", label: "Home", icon: LayoutDashboard },
  {
    to: "/ceo/members",
    label: "Trainees",
    icon: Users,
    matchPrefixes: ["/ceo/attendance"],
  },
  {
    to: "/ceo/courses",
    label: "Training",
    icon: BookOpen,
    matchPrefixes: ["/ceo/assign", "/ceo/projects"],
  },
  {
    to: "/ceo/submissions",
    label: "Reviews",
    icon: ClipboardCheck,
    matchPrefixes: ["/ceo/grades", "/ceo/qa"],
  },
  {
    to: "/ceo/franchises",
    label: "Settings",
    icon: Settings,
    matchPrefixes: ["/ceo/view-as-member"],
  },
];

// Sub-nav tabs shown at the top of each grouped section's pages.
const CEO_SECTIONS: { matchPrefixes: string[]; tabs: SubNavTab[] }[] = [
  {
    matchPrefixes: ["/ceo/members", "/ceo/attendance"],
    tabs: [
      { to: "/ceo/members", label: "Members" },
      { to: "/ceo/attendance", label: "Attendance" },
    ],
  },
  {
    matchPrefixes: ["/ceo/courses", "/ceo/assign", "/ceo/projects"],
    tabs: [
      { to: "/ceo/courses", label: "Courses" },
      { to: "/ceo/assign", label: "Assign" },
      { to: "/ceo/projects", label: "Projects" },
    ],
  },
  {
    matchPrefixes: ["/ceo/submissions", "/ceo/grades", "/ceo/qa"],
    tabs: [
      { to: "/ceo/submissions", label: "Submissions" },
      { to: "/ceo/grades", label: "Grades" },
      { to: "/ceo/qa", label: "QA reviewers" },
    ],
  },
  {
    matchPrefixes: ["/ceo/franchises", "/ceo/view-as-member"],
    tabs: [
      { to: "/ceo/franchises", label: "Franchises" },
      { to: "/incharge", label: "View as Incharge" },
      { to: "/ceo/view-as-member", label: "View as Member" },
      { to: "/qa", label: "View as QA" },
      { to: "/profile", label: "Profile" },
    ],
  },
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

  const activeSection = isAuthorOnly
    ? undefined
    : CEO_SECTIONS.find((s) =>
        s.matchPrefixes.some(
          (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
        ),
      );

  return (
    <RoleGuard allow={["ceo"]} allowUserIds={COURSE_AUTHOR_IDS}>
      <AppShell nav={nav} roleLabel={roleLabel}>
        {activeSection && <SectionSubNav tabs={activeSection.tabs} />}
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
