import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { MemberDetailView } from "@/components/progress/MemberDetailView";

export const Route = createFileRoute("/member/progress")({
  component: MyProgress,
});

function MyProgress() {
  const { user } = useAuth();
  if (!user) {
    return <p className="text-sm text-muted-foreground">Sign in to view your progress.</p>;
  }
  return <MemberDetailView userId={user.id} />;
}
