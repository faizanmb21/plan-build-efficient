import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FranchisesAndInvitesSection } from "@/components/ceo/FranchisesAndInvitesSection";
import { InchargeMemberStrip } from "@/components/ceo/InchargeMemberStrip";
import { MemberGradeReport } from "@/components/MemberGradeReport";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { fetchOrgPerformance } from "./ceo.index";

export const Route = createFileRoute("/ceo/franchises/")({
  component: FranchisesPage,
});

function FranchisesPage() {
  const perfQuery = useQuery({
    queryKey: ["ceo", "org-performance-v2"],
    queryFn: fetchOrgPerformance,
  });
  const perf = perfQuery.data;

  const confirm = useConfirm();
  const [gradeMember, setGradeMember] = React.useState<{
    id: string;
    name: string | null;
  } | null>(null);

  const handleArchive = React.useCallback(
    async (id: string, name: string) => {
      const ok = await confirm({
        title: "Archive franchise?",
        description: `Archive "${name}"? Members will be detached. You can restore for 30 days; after that it can be permanently deleted.`,
        confirmLabel: "Archive",
        variant: "destructive",
      });
      if (!ok) return;
      const { error } = await supabase.rpc("archive_franchise", { _franchise_id: id });
      if (error) return toast.error(error.message);
      toast.success("Franchise archived");
      perfQuery.refetch();
    },
    [confirm, perfQuery],
  );

  return (
    <div className="space-y-6">
      {/* Management section pinned to the top */}
      <FranchisesAndInvitesSection />

      {/* Franchise overview — donuts + member rosters */}
      <InchargeMemberStrip
        blocks={perf?.inchargeBlocks ?? []}
        onMemberClick={(id, name) => setGradeMember({ id, name })}
        onArchive={handleArchive}
      />

      <Dialog
        open={!!gradeMember}
        onOpenChange={(o) => !o && setGradeMember(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {gradeMember && (
            <MemberGradeReport
              userId={gradeMember.id}
              fullName={gradeMember.name}
              franchiseName={null}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
