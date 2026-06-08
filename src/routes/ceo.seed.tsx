import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { seedDemo } from "@/lib/seed-demo.functions";

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
          One-shot population: 3 franchises, 25 accounts (CEO, 3 Incharges, 1 QA, 20 Members),
          courses with lessons, assignments and graded submissions across every member. Also wires the
          QA reviewer to <span className="font-medium">IRM Sargodha</span> and{" "}
          <span className="font-medium">IRM Lahore</span>. Safe to run more than once — rerunning it also
          restores all demo account passwords to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">Academy@123</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Run the seeder
          </CardTitle>
          <CardDescription>
            Creates accounts and resets existing demo passwords to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">Academy@123</code>, then populates franchises,
            courses, lessons, assignments and a few graded practical submissions so the Incharge queue and
            Member dashboard are populated immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button onClick={handleSeed} disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Seeding…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Seed & reset passwords
              </>
            )}
          </Button>
          {result?.ok && (
            <Badge variant="secondary" className="bg-success/10 text-success">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done
            </Badge>
          )}
          {result && !result.ok && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Failed
            </Badge>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Summary</CardTitle>
                <CardDescription>Account sync results.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Created" value={result.created.length} tone="success" />
              <Stat label="Password reset" value={result.reset.length} tone="muted" />
              <Stat
                label="Failed"
                value={result.failed.length}
                tone={result.failed.length ? "danger" : "muted"}
              />
            </CardContent>
          </Card>

          {result.failed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {result.failed.map((f) => (
                    <li key={f.email}>
                      <span className="font-mono">{f.email}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.accounts && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Login credentials</CardTitle>
                  <CardDescription>
                    All accounts share the same password. Sign out and log in as Incharge or Member to see
                    different views.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={copyCreds}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy all
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Password</th>
                        <th className="px-3 py-2 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.accounts.map((a) => (
                        <tr key={a.email} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{a.email}</td>
                          <td className="px-3 py-2 font-mono text-xs">{a.password}</td>
                          <td className="px-3 py-2 text-muted-foreground">{roleFor(a.email)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function roleFor(email: string): string {
  if (email.startsWith("ceo@")) return "CEO";
  if (email.startsWith("incharge.")) return "Incharge";
  if (email.startsWith("qa@")) return "QA Reviewer (assigned: Sargodha + Lahore)";
  if (email.startsWith("you@")) return "Member (your demo)";
  return "Member";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "muted" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-display font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
