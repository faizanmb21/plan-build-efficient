import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AttendanceTimesheet } from "@/components/attendance/AttendanceTimesheet";
import { AttendanceReport } from "@/components/attendance/AttendanceReport";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/incharge/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const { realProfile, profile, viewAsFranchiseId } = useAuth();
  const franchiseId =
    viewAsFranchiseId ?? realProfile?.franchise_id ?? profile?.franchise_id ?? null;

  const [franchiseName, setFranchiseName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!franchiseId) {
      setFranchiseName(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("franchises")
        .select("name")
        .eq("id", franchiseId)
        .maybeSingle();
      setFranchiseName(data?.name ?? null);
    })();
  }, [franchiseId]);

  if (!franchiseId) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        You're not assigned to a franchise yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Timesheet and monthly report cards for{" "}
          <span className="font-medium text-foreground">
            {franchiseName ?? "your franchise"}
          </span>
          .
        </p>
      </header>

      <Tabs defaultValue="timesheet">
        <TabsList>
          <TabsTrigger value="timesheet">Weekly timesheet</TabsTrigger>
          <TabsTrigger value="report">Monthly report</TabsTrigger>
        </TabsList>
        <TabsContent value="timesheet" className="mt-4">
          <AttendanceTimesheet
            franchiseId={franchiseId}
            scopeLabel={franchiseName ?? "Franchise"}
          />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <AttendanceReport
            franchiseId={franchiseId}
            scopeLabel={franchiseName ?? "Franchise"}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
