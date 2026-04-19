import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { seedDemo } from "@/server/seed-demo";

export const Route = createFileRoute("/ceo/seed")({
  component: SeedPage,
});

interface SeedResult {
  ok: boolean;
  created: string[];
  reset: string[];
  failed: { email: string; error: string }[];
  accounts?: { email: string; password: string }[];
  seedResult?: unknown;
  error?: string;
}

function SeedPage() {
  const seed = useServerFn(seedDemo);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<SeedResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleSeed() {
    setLoading(true);
    setResult(null);
    try {
      const r = (await seed()) as SeedResult;
      setResult(r);
      if (r.ok) {
        toast.success("Demo accounts synced and passwords reset");
      } else {
        toast.error(r.error || "Seed failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Seed failed");
      setResult({ ok: false, created: [], reset: [], failed: [], error: e?.message });
    } finally {
      setLoading(false);
    }
  }

  function copyCreds() {
    if (!result?.accounts) return;
    const text = result.accounts.map((a) => `${a.email}\t${a.password}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Credentials copied to clipboard");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl tracking-tight">Seed demo data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-shot population: 3 franchises, 24 accounts, 12 courses with lessons, assignments and sample
          progress + submissions. Safe to run more than once — rerunning it also restores all demo account
          passwords.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Run the seeder
          </CardTitle>
          <CardDescription>
            Creates accounts and resets existing demo passwords to{
