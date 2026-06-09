import * as React from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Globe2 } from "lucide-react";
import { toast } from "sonner";

type Franchise = { id: string; name: string };

export function EditQaAccessDialog({
  open,
  onOpenChange,
  qa,
  franchises,
  initialSelected,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  qa: { id: string; full_name: string | null } | null;
  franchises: Franchise[];
  initialSelected: Set<string>;
  onSaved: () => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelected(new Set(initialSelected));
  }, [open, initialSelected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === franchises.length ? new Set() : new Set(franchises.map((f) => f.id)),
    );
  };

  async function save() {
    if (!qa) return;
    setSaving(true);
    const wanted = selected;
    const { data: current, error: rErr } = await supabase
      .from("qa_franchise_assignments")
      .select("franchise_id")
      .eq("user_id", qa.id);
    if (rErr) {
      toast.error(rErr.message);
      setSaving(false);
      return;
    }
    const currentSet = new Set((current ?? []).map((r) => r.franchise_id));
    const toAdd = [...wanted].filter((f) => !currentSet.has(f));
    const toRemove = [...currentSet].filter((f) => !wanted.has(f));

    if (toAdd.length) {
      const { error } = await supabase
        .from("qa_franchise_assignments")
        .insert(toAdd.map((fid) => ({ user_id: qa.id, franchise_id: fid })));
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("qa_franchise_assignments")
        .delete()
        .eq("user_id", qa.id)
        .in("franchise_id", toRemove);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    toast.success("Franchise access updated");
    setSaving(false);
    onSaved();
    onOpenChange(false);
  }

  const orgWide = selected.size === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit franchise access</DialogTitle>
          <DialogDescription>
            {qa?.full_name ?? "QA reviewer"} can review submissions for the selected centres.
            Leave everything unchecked to grant <strong>org-wide</strong> access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {orgWide ? (
                <span className="inline-flex items-center gap-1">
                  <Globe2 className="h-3.5 w-3.5" /> Org-wide access
                </span>
              ) : (
                <>Scoped to {selected.size} centre{selected.size === 1 ? "" : "s"}</>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === franchises.length ? "Clear all" : "Select all"}
            </Button>
          </div>

          <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {franchises.map((f) => {
              const checked = selected.has(f.id);
              return (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(f.id)} />
                  <span className="text-sm">{f.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
