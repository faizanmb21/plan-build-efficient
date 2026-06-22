import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { MemberDetailView } from "@/components/progress/MemberDetailView";

export const Route = createFileRoute("/ceo/members/$userId")({
  component: CeoMemberDetail,
});

function CeoMemberDetail() {
  const { userId } = Route.useParams();
  return (
    <div className="space-y-4">
      <Link to="/ceo/members" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Back to roster
      </Link>
      <MemberDetailView userId={userId} canEditSchedule={true} />
    </div>
  );
}
