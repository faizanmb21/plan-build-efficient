import * as React from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createUserAccountsBulk } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsersRound, Copy, Download, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Cred = { name: string; email: string; password: string };

export function BulkCreateAccountsDialog({
  franchises,
  onCreated,
  callerScope,
  lockFranchiseId = null,
  triggerLabel = "Create bulk accounts",
}: {
  franchises: { id: string; name: string }[];
  onCreated: () => void;
  callerScope: "ceo" | "incharge";
  lockFranchiseId?: string | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [franchiseId, setFranchiseId] = React.useState(lockFranchiseId ?? "");
  const [count, setCount] = React.useState(10);
  const [prefix, setPrefix] = React.useState("Member");
  const [workStart, setWorkStart] = React.useState<string>("");
  const [workEnd, setWorkEnd] = React.useState<string>("");
  const DAY_OPTIONS = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ] as const;
  const [workingDays, setWorkingDays] = React.useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<Cred[] | null>(null);
  const [failed, setFailed] = React.useState<{ index: number; error: string }[]>([]);
  const bulkFn = useServerFn(createUserAccountsBulk);

  function reset() {
    setFranchiseId(lockFranchiseId ?? "");
    setCount(10);
    setPrefix("Member");
    setWorkStart("");
    setWorkEnd("");
    setWorkingDays(["mon", "tue", "wed", "thu", "fri"]);
    setCreated(null);
    setFailed([]);
  }

  function toMin(v: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  const dailyHours = (() => {
    const s = toMin(workStart);
    const e = toMin(workEnd);
    if (s === null || e === null) return null;
    let diff = e - s;
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 100) / 100;
  })();
  const weeklyHours =
    dailyHours === null ? null : Math.round(dailyHours * workingDays.length * 100) / 100;


  const effectiveFranchiseId = lockFranchiseId ?? franchiseId;
  const canSubmit =
    !!effectiveFranchiseId && count >= 1 && count <= 50 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        toast.error("Your session has expired. Please sign in again.");
        setBusy(false);
        return;
      }
      const res = await bulkFn({
        data: {
          franchiseId: effectiveFranchiseId,
          count,
          namePrefix: prefix.trim() || "Member",
          workStartTime: workStart || null,
          workEndTime: workEnd || null,
          workingDays,
          accessToken,
        },
      });

      if (!res.ok) {
        toast.error(res.error);
        setBusy(false);
        return;
      }
      setCreated(res.created);
      setFailed(res.failed);
      if (res.created.length > 0) toast.success(`Created ${res.created.length} accounts`);
      if (res.failed.length > 0) toast.error(`${res.failed.length} failed`);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Bulk creation failed");
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    if (!created) return;
    const text = created
      .map((c) => `${c.name} | ${c.email} | ${c.password}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("All credentials copied");
  }

  function copyRow(c: Cred) {
    navigator.clipboard.writeText(`${c.name} | ${c.email} | ${c.password}`);
    toast.success("Copied");
  }

  function downloadXlsx() {
    if (!created) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      created.map((c) => ({ Name: c.name, Email: c.email, Password: c.password })),
    );
    XLSX.utils.book_append_sheet(wb, ws, "Credentials");
    const franchiseName =
      franchises.find((f) => f.id === effectiveFranchiseId)?.name ?? "franchise";
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `accounts-${franchiseName}-${stamp}.xlsx`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UsersRound className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {created.length} account{created.length === 1 ? "" : "s"} created
              </DialogTitle>
              <DialogDescription>
                Save these now — passwords cannot be retrieved later. Users will be prompted
                to change their password on first sign-in.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyAll}>
                <Copy className="h-4 w-4" /> Copy all
              </Button>
              <Button variant="outline" size="sm" onClick={downloadXlsx}>
                <Download className="h-4 w-4" /> Download .xlsx
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Email</th>
                    <th className="px-2 py-1.5 font-medium">Password</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {created.map((c) => (
                    <tr key={c.email} className="border-t">
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5">{c.email}</td>
                      <td className="px-2 py-1.5">{c.password}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => copyRow(c)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {failed.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {failed.length} failed
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {failed.map((f) => (
                    <li key={f.index}>
                      #{f.index}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create bulk member accounts</DialogTitle>
              <DialogDescription>
                Generate multiple member logins at once. Emails and strong passwords are
                generated automatically — you'll see them all on the next screen.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              {!lockFranchiseId && (
                <div className="space-y-1.5">
                  <Label>Franchise <span className="text-destructive">*</span></Label>
                  <Select value={franchiseId} onValueChange={setFranchiseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select franchise" />
                    </SelectTrigger>
                    <SelectContent>
                      {franchises.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="bulk-count">
                  How many accounts? <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bulk-count"
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">Up to 50 at a time.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-prefix">Name prefix (optional)</Label>
                <Input
                  id="bulk-prefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="Member"
                  maxLength={32}
                />
                <p className="text-xs text-muted-foreground">
                  Display names will be like "{(prefix.trim() || "Member")} 1",
                  "{(prefix.trim() || "Member")} 2"… Numbering continues from existing accounts.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-hours">Expected daily hours</Label>
                <Input
                  id="bulk-hours"
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={expectedHours}
                  onChange={(e) => setExpectedHours(Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  Baseline used in target vs actual reports. Default 8h.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Working days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map((d) => {
                    const checked = workingDays.includes(d.key);
                    return (
                      <label
                        key={d.key}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                          checked
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={checked}
                          onChange={(e) => {
                            setWorkingDays((prev) =>
                              e.target.checked
                                ? Array.from(new Set([...prev, d.key]))
                                : prev.filter((x) => x !== d.key),
                            );
                          }}
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Days these members are expected to work. Default Mon–Fri.
                </p>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={!canSubmit}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : `Create ${count} accounts`}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
