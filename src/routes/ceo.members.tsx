import { createFileRoute } from "@tanstack/react-router";
import { RosterTable } from "@/components/progress/RosterTable";

export const Route = createFileRoute("/ceo/members")({
  component: CeoMembers,
});

function CeoMembers() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Progress, attendance, grades, and QA backlog across every franchise.
          Click a member to drill into their full report.
        </p>
      </header>
      <RosterTable scope="ceo" detailRoutePrefix="/ceo/members" />
    </div>
  );
}
