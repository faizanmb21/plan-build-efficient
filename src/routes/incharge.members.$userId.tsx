import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { MemberDetailView } from "@/components/progress/MemberDetailView";

export const Route = createFileRoute("/incharge/members/$userId")({
  component: InchargeMemberDetail,
});

function InchargeMemberDetail() {
  const { userId } = Route.useParams();
  return (
    <div className="space-y-4">
      <Link to="/incharge/members" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Back to members
      </Link>
      <MemberDetailView userId={userId} />
    </div>
  );
}
