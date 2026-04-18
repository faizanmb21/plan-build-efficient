import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/member/")({
  component: MemberHome,
});

function MemberHome() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My Courses</h1>
        <p className="text-sm text-muted-foreground">Your assigned learning.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>No courses assigned yet</CardTitle>
          <CardDescription>
            Once your CEO assigns a course to you or your franchise, it will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You're authenticated as Member. Foundation is working ✅
        </CardContent>
      </Card>
    </div>
  );
}
