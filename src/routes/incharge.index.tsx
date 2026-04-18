import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/incharge/")({
  component: InchargeDashboard,
});

function InchargeDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Incharge dashboard</h1>
        <p className="text-sm text-muted-foreground">Your franchise at a glance.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming up next</CardTitle>
          <CardDescription>
            Team list and grading queue will appear here in the next build wave.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          For now, you're authenticated as Incharge. Foundation is working ✅
        </CardContent>
      </Card>
    </div>
  );
}
