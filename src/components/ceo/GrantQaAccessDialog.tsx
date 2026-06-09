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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, BadgeCheck, Globe2, Search } from "lucide-react";
import { toast } from "sonner";
import { listGrantableUsers, grantQaToUser } from "@/lib/create-qa-account.functions";

type Franchise = { id: string; name: string };
type Candidate = {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: string[];
};

export function GrantQaAccessDialog({
  open,
  onOpenChange,
  franchises,
  onGranted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  franchises: Franchise[];
  onGranted: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [users, setUsers] = React.useState<Candidate[]>([]);
  const [pickedUserId, setPickedUserId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [orgWide, setOrgWide] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);

  const listFn = useServerFn(listGrantableUsers);
  const grantFn = useServerFn(grantQaToUser);

  React.useEffect(() => {
    if (!open) return;
    setPickedUserId("");
    setQuery("");
    setOrgWide(false);
    setSelected(new Set());
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Session expired");
        setLoading(false);
        return;
      }
      const r = (await listFn({ data: { accessToken: token } })) as
        | { ok: true; users: Candidate[] }
        | { ok: false; error: string; users: Candidate[] };
      if (r.ok) setUsers(r.users);
      else toast.error(r.error);
      setLoading(false);
    })();
  }, [open, listFn]);

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function save() {
    if (!pickedUserId) {
      toast.error("Pick a person first");
      return;
    }
    if (!orgWide && selected.size === 0) {
      toast.error("Pick centres or check Org-wide");
      return;
    }
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      toast.error("Session expired");
      setSaving(false);
      return;
    }
    const r = (await grantFn({
      data: {
        accessToken: token,
        userId: pickedUserId,
        franchiseIds: orgWide ? [] : [...selected],
      },
    })) as { ok: true } | { ok: false; error: string };
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("QA access granted");
    onGranted();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grant QA access to existing user</DialogTitle>
          <DialogDescription>
            Pick any current Incharge or Member and add QA reviewer access on top of their existing role.
            Their login, profile and current role stay untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Person</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {loading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Nobody available. All current users may already be QA reviewers.
                </div>
              ) : (
                filtered.map((u) => {
                  const active = pickedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setPickedUserId(u.id)}
                      className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${
                        active ? "bg-muted" : ""
                      }`}
                    >
                      <div>
                        <div className="font-medium">{u.full_name ?? "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px] uppercase">
                            {r}
                          </Badge>
                        ))}
                        {active && <BadgeCheck className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>QA centre access</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3 hover:bg-muted/40">
              <Checkbox
                checked={orgWide}
                onCheckedChange={(v) => {
                  setOrgWide(!!v);
                  if (v) setSelected(new Set());
                }}
              />
              <Globe2 className="h-4 w-4" />
              <span className="text-sm font-medium">Org-wide (all centres)</span>
            </label>
            <div
              className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${
                orgWide ? "pointer-events-none opacity-50" : ""
              }`}
            >
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !pickedUserId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Grant QA access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
