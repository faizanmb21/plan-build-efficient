import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Users,
  ArrowRight,
  Building2,
  MapPin,
  Archive,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  GradeDistributionBar,
  MiniAvatar,
} from "@/components/dashboard/ProgressPrimitives";
import { GradePieCard } from "@/components/grading/GradePieCard";
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
  location: string | null;
  inchargeName: string | null;
  agg: GradeAggregate;
  members: InchargeMember[];
  isArchived: boolean;
  archivedAt: string | null;
  autoDeleteAt: string | null;
}

const MAX_MEMBERS_VISIBLE = 10;

export function InchargeMemberStrip({
  blocks,
  onMemberClick,
  onArchive,
  onRestore,
  onPurge,
}: {
  blocks: InchargeBlock[];
  onMemberClick: (userId: string, fullName: string | null, franchiseName: string) => void;
  onArchive?: (id: string, name: string) => void;
  onRestore?: (id: string) => void;
  onPurge?: (id: string, name: string, force: boolean) => void;
}) {
  if (blocks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Franchise overview</CardTitle>
          <CardDescription>
            Each franchise's grade mix and member roster
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No franchises yet. Create one below to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Franchise overview ({blocks.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Each franchise's grade distribution &amp; member roster · click a member to open
          their grade report
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((b) => {
          const visibleMembers = b.members.slice(0, MAX_MEMBERS_VISIBLE);
          const overflow = Math.max(0, b.members.length - MAX_MEMBERS_VISIBLE);
          const purgeReady =
            b.isArchived &&
            !!b.archivedAt &&
            new Date(b.archivedAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;

          return (
            <Card
              key={b.franchiseId}
              className={
                b.isArchived
                  ? "opacity-70 overflow-hidden p-0"
                  : "group overflow-hidden p-0 transition-all duration-200 hover:border-accent/50 hover:shadow-lg"
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-accent" /> {b.franchiseName}
                  </CardTitle>
                  {b.isArchived && <Badge variant="destructive">Archived</Badge>}
                </div>
                {b.location && (
                  <CardDescription className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> {b.location}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="space-y-4 text-sm">
                {!b.isArchived && (
                  <div className="flex justify-center">
                    <GradePieCard agg={b.agg} size={150} showStats={false} />
                  </div>
                )}

                {!b.isArchived && b.agg.total > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> A+ {b.agg.aPlus}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-sky-500" /> A {b.agg.a}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" /> B {b.agg.b}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500" /> Redo {b.agg.c}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5 text-muted-foreground">
                  <div className="flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {b.inchargeName ?? "No incharge yet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" /> {b.members.length} member
                    {b.members.length === 1 ? "" : "s"}
                  </div>
                </div>

                {!b.isArchived && (
                  <>
                    <div className="-mx-1 border-t border-white/5" />

                    {visibleMembers.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        No members yet
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {visibleMembers.map((m) => {
                          const tone: "indigo" | "rose" | "amber" =
                            m.agg.total > 0 && m.agg.averagePercent < 70
                              ? "rose"
                              : m.agg.total > 0 && m.agg.averagePercent < 80
                                ? "amber"
                                : "indigo";
                          return (
                            <li key={m.userId}>
                              <button
                                type="button"
                                onClick={() => onMemberClick(m.userId, m.fullName, b.franchiseName)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {overflow > 0 && (
                      <Link
                        to="/ceo/franchises/$id"
                        params={{ id: b.franchiseId }}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-accent transition-all duration-200 hover:border-accent/50 hover:bg-accent/10"
                      >
                        <span>View all {b.members.length} members</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    <Link
                      to="/ceo/franchises/$id"
                      params={{ id: b.franchiseId }}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-accent transition-all duration-200 hover:border-accent/50 hover:bg-accent/10"
                    >
                      <span>Click for more details</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </>
                )}
              </CardContent>

              {(onArchive || onRestore || onPurge) && (
                <div className="space-y-2 border-t border-border/60 px-6 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!b.isArchived ? (
                      onArchive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onArchive(b.franchiseId, b.franchiseName)}
                        >
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </Button>
                      )
                    ) : (
                      <>
                        {onRestore && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRestore(b.franchiseId)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </Button>
                        )}
                        {onPurge && purgeReady ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onPurge(b.franchiseId, b.franchiseName, false)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete forever
                          </Button>
                        ) : onPurge ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => onPurge(b.franchiseId, b.franchiseName, true)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Force delete
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                  {b.isArchived && b.autoDeleteAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Auto-purge after {new Date(b.autoDeleteAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
