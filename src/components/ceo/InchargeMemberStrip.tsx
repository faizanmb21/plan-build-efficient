import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Users, ArrowRight } from "lucide-react";
import {
  GradeDistributionBar,
  MiniAvatar,
} from "@/components/dashboard/ProgressPrimitives";
import type { GradeAggregate } from "@/lib/grade-utils";

export interface InchargeMember {
  userId: string;
  fullName: string | null;
  agg: GradeAggregate;
  avgCompletion: number;
}

export interface InchargeBlock {
  franchiseId: string;
  franchiseName: string;
  inchargeName: string | null;
  members: InchargeMember[];
}

export function InchargeMemberStrip({ blocks }: { blocks: InchargeBlock[] }) {
  if (blocks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incharge & members</CardTitle>
          <CardDescription>
            Each incharge's roster with grade distribution per member
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No incharges assigned yet. Invite an incharge to a franchise to populate this view.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Incharge & members</CardTitle>
        <CardDescription>
          Each incharge's roster with grade distribution per member · click a member to open
          their franchise profile
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {blocks.map((b) => (
            <div
              key={b.franchiseId}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                    <span className="truncate">{b.inchargeName ?? "Unassigned incharge"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{b.franchiseName}</div>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {b.members.length}
                </div>
              </div>

              {b.members.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No members yet
                </p>
              ) : (
                <ul className="space-y-2">
                  {b.members.map((m) => {
                    const tone: "indigo" | "rose" | "amber" =
                      m.agg.total > 0 && m.agg.averagePercent < 70
                        ? "rose"
                        : m.agg.total > 0 && m.agg.averagePercent < 80
                          ? "amber"
                          : "indigo";
                    return (
                      <li key={m.userId}>
                        <Link
                          to="/ceo/franchises/$id"
                          params={{ id: b.franchiseId }}
                          className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
                        >
                          <MiniAvatar name={m.fullName} tone={tone} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium">
                                {m.fullName ?? "Unnamed"}
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {m.agg.total > 0 ? `${m.agg.averagePercent}%` : "—"}
                              </span>
                            </div>
                            <div className="mt-1">
                              <GradeDistributionBar agg={m.agg} width={180} />
                            </div>
                          </div>
                          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
