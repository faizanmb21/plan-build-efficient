import { createFileRoute, Outlet, useRouter, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/components/RoleGuard";
import { AppShell, type NavItem } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  LayoutDashboard,
  FileCheck,
  Activity,
  Users,
  GraduationCap,
  Send,
  FolderKanban,
  Building2,
  Eye,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { canEditCourseMandatory } from "@/lib/access";
import { Settings2 } from "lucide-react";

const baseNav: NavItem[] = [
  { to: "/incharge", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incharge/members", label: "Members", icon: Users },
  { to: "/incharge/assign", label: "Assign courses", icon: Send },
  { to: "/incharge/projects", label: "Projects", icon: FolderKanban },
  { to: "/incharge/grades", label: "Grades", icon: GraduationCap },
  { to: "/incharge/attendance", label: "Attendance", icon: Activity },
  { to: "/incharge/reviews", label: "Submissions", icon: FileCheck },
];

export const Route = createFileRoute("/incharge")({
  component: InchargeLayout,
  errorComponent: InchargeError,
});

function InchargeError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load this page</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error?.message || "An unexpected error occurred."}
      </p>
      <Button
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

function InchargeLayout() {
  const { user, roles, viewAsFranchiseId, setViewAsFranchiseId } = useAuth();
  const isCeo = roles.includes("ceo");
  const isIncharge = roles.includes("incharge");
  const navigate = useNavigate();

  const nav = React.useMemo<NavItem[]>(() => {
    if (canEditCourseMandatory(user?.id, roles)) {
      return [
        ...baseNav,
        { to: "/incharge/course-rules", label: "Course rules", icon: Settings2 },
      ];
    }
    return baseNav;
  }, [user?.id, roles]);

  // CEO without an active "view-as" gets a franchise picker first.
  const showPicker = isCeo && !isIncharge && !viewAsFranchiseId;

  // Look up selected franchise name for the banner.
  const franchiseNameQuery = useQuery({
    queryKey: ["view-as-franchise-name", viewAsFranchiseId],
    queryFn: async () => {
      if (!viewAsFranchiseId) return null;
      const { data } = await supabase
        .from("franchises")
        .select("name")
        .eq("id", viewAsFranchiseId)
        .maybeSingle();
      return data?.name ?? null;
    },
    enabled: !!viewAsFranchiseId,
  });

  return (
    <RoleGuard allow={["incharge", "ceo"]}>
      <AppShell nav={nav} roleLabel="Incharge">
        {isCeo && viewAsFranchiseId && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-accent" />
              Viewing as Incharge —{" "}
              <strong>{franchiseNameQuery.data ?? "…"}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setViewAsFranchiseId(null)}
              >
                Change franchise
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setViewAsFranchiseId(null);
                  navigate({ to: "/ceo" });
                }}
              >
                <X className="h-3.5 w-3.5" /> Exit
              </Button>
            </div>
          </div>
        )}

        {showPicker ? <FranchisePicker /> : <Outlet />}
      </AppShell>
    </RoleGuard>
  );
}

function FranchisePicker() {
  const { setViewAsFranchiseId } = useAuth();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["view-as", "franchise-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("franchises")
        .select("id, name, location")
        .is("archived_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          View as Incharge
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a franchise to preview the Incharge experience scoped to it.
        </p>
      </div>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading franchises…</div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active franchises to preview.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(query.data ?? []).map((f) => (
            <Card key={f.id} className="hover-lift">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-accent" />
                  {f.name}
                </CardTitle>
                {f.location && (
                  <CardDescription>{f.location}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setViewAsFranchiseId(f.id);
                    navigate({ to: "/incharge" });
                  }}
                >
                  <Eye className="h-3.5 w-3.5" /> View as Incharge
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
