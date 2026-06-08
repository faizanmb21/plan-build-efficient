import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, RefreshCw, Search } from "lucide-react";
import { CompletionBar } from "./CompletionBar";
import { StatusBadge } from "./StatusBadge";
import {
  fetchRoster,
  type RosterRow,
  type RosterScope,
  type ProgressStatus,
} from "@/lib/member-progress";
import { buildAndDownloadRosterReport } from "@/lib/member-progress-export";
import { toast } from "sonner";

type SortKey =
  | "name"
  | "franchise"
  | "completion"
  | "hours"
  | "attendance"
  | "grade"
  | "pending"
  | "status";

const STATUS_ORDER: Record<ProgressStatus, number> = {
  at_risk: 0,
  slipping: 1,
  on_track: 2,
};

interface Props {
  scope: RosterScope;
  /** Route prefix for drill-down links, e.g. "/ceo/members" or "/incharge/members". */
  detailRoutePrefix: string;
}

export function RosterTable({ scope, detailRoutePrefix }: Props) {
  const [rows, setRows] = React.useState<RosterRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | ProgressStatus>("all");
  const [franchiseFilter, setFranchiseFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("status");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRoster(scope);
      setRows(data);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    load();
  }, [load]);

  const franchises = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows ?? []) {
      if (r.franchiseId && r.franchiseName) map.set(r.franchiseId, r.franchiseName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = React.useMemo(() => {
    let arr = rows ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.franchiseName ?? "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") arr = arr.filter((r) => r.status === statusFilter);
    if (franchiseFilter !== "all") arr = arr.filter((r) => r.franchiseId === franchiseFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...arr].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.fullName.localeCompare(b.fullName) * dir;
        case "franchise": return (a.franchiseName ?? "").localeCompare(b.franchiseName ?? "") * dir;
        case "completion": return (a.completionPct - b.completionPct) * dir;
        case "hours": return (a.hoursThisWeek - b.hoursThisWeek) * dir;
        case "attendance": return (a.attendancePct14d - b.attendancePct14d) * dir;
        case "grade": return ((a.avgGrade ?? -1) - (b.avgGrade ?? -1)) * dir;
        case "pending": return (a.pendingQa - b.pendingQa) * dir;
        case "status": return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
      }
    });
    return sorted;
  }, [rows, search, statusFilter, franchiseFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "franchise" ? "asc" : "desc");
    }
  }

  async function exportXlsx() {
    if (!rows) return;
    setExporting(true);
    try {
      await buildAndDownloadRosterReport(filtered);
      toast.success("Report downloaded");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const counts = React.useMemo(() => {
    const c = { on_track: 0, slipping: 0, at_risk: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Roster ({filtered.length}
              {rows && rows.length !== filtered.length ? ` of ${rows.length}` : ""})
            </CardTitle>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-400">{counts.on_track} on track</span>
              <span className="text-amber-400">{counts.slipping} slipping</span>
              <span className="text-rose-400">{counts.at_risk} at risk</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={exportXlsx} disabled={exporting || !rows?.length}>
              <Download className="h-4 w-4" />
              {exporting ? "Building…" : "Export report"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or franchise"
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="slipping">Slipping</SelectItem>
              <SelectItem value="on_track">On track</SelectItem>
            </SelectContent>
          </Select>
          {scope === "ceo" && franchises.length > 0 && (
            <Select value={franchiseFilter} onValueChange={setFranchiseFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All franchises</SelectItem>
                {franchises.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading && !rows ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading roster…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No members match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border/60">
                  <Th label="Member" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  {scope === "ceo" && (
                    <Th label="Franchise" k="franchise" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  )}
                  <Th label="Completion" k="completion" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Hours / wk" k="hours" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Attendance" k="attendance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Avg grade" k="grade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Pending QA" k="pending" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.userId} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-2 pr-4">
                      <Link
                        to={`${detailRoutePrefix}/$userId`}
                        params={{ userId: r.userId }}
                        className="font-medium hover:underline"
                      >
                        {r.fullName}
                      </Link>
                    </td>
                    {scope === "ceo" && (
                      <td className="py-2 pr-4 text-muted-foreground">{r.franchiseName ?? "—"}</td>
                    )}
                    <td className="py-2 pr-4"><CompletionBar value={r.completionPct} /></td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.hoursThisWeek.toFixed(1)}h</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.attendancePct14d}%</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.avgGrade ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.pendingQa}</td>
                    <td className="py-2 pr-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 pr-4 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
