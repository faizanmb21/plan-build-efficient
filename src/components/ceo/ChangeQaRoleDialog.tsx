import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { changeQaRole } from "@/lib/create-qa-account.functions";

type Franchise = { id: string; name: string };

export function ChangeQaRoleDialog({
  open,
  onOpenChange,
  qa,
  franchises,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  qa: { id: string; full_name: string | null } | null;
  franchises: Franchise[];
  onChanged: () => void;
}) {
  const [newRole, setNewRole] = React.useState<"incharge" | "member">("member");
  const [franchiseId, setFranchiseId] = React.useState<string>("");
  const [keepQa, setKeepQa] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const change = useServerFn(changeQaRole);

  React.useEffect(() => {
    if (open) {
      setNewRole("member");
      setFranchiseId("");
      setKeepQa(false);
    }
  }, [open]);

  async function save() {
    if (!qa || !franchiseId) {
      toast.error("Pick a franchise");
      return;
    }
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      toast.error("Your session has expired. Please sign in again.");
      setSaving(false);
      return;
    }
    try {
      const r = (await change({
        data: { accessToken: token, userId: qa.id, newRole, franchiseId, keepQa },
      })) as { ok: true } | { ok: false; error: string };
      if (!r.ok) {
        toast.error(r.error);
      } else {
        const roleLabel = newRole === "incharge" ? "an Incharge" : "a Member";
        toast.success(
          `${qa.full_name ?? "User"} is now ${roleLabel}${keepQa ? " (QA access kept)" : ""}`,
        );
        onChanged();
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to change role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Convert <strong>{qa?.full_name ?? "this QA"}</strong> to a different role.
            Their login, profile and history (grades they gave, submissions reviewed)
            are kept intact — only their access changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>New role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "incharge" | "member")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="incharge">Incharge (franchise manager)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Franchise</Label>
            <Select value={franchiseId} onValueChange={setFranchiseId}>
              <SelectTrigger><SelectValue placeholder="Pick a franchise" /></SelectTrigger>
              <SelectContent>
                {franchises.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newRole === "incharge" && (
              <p className="text-xs text-muted-foreground">
                They will become the manager of this franchise.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !franchiseId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
