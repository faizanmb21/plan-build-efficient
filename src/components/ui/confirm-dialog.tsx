import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
}

type ConfirmRequest = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};
type PromptRequest = PromptOptions & {
  resolve: (value: string | null) => void;
};

// ---------------------------------------------------------------------------
// Global event bus (simple — no extra deps)
// ---------------------------------------------------------------------------

type Listener = (req: ConfirmRequest | PromptRequest, kind: "confirm" | "prompt") => void;
const listeners = new Set<Listener>();

function emit(req: ConfirmRequest | PromptRequest, kind: "confirm" | "prompt") {
  if (listeners.size === 0) {
    // No host mounted — fall back to native so the app doesn't deadlock.
    if (kind === "confirm") {
      const ok = typeof window !== "undefined" ? window.confirm(req.title) : false;
      (req as ConfirmRequest).resolve(ok);
    } else {
      const v =
        typeof window !== "undefined"
          ? window.prompt(req.title, (req as PromptRequest).defaultValue ?? "")
          : null;
      (req as PromptRequest).resolve(v);
    }
    return;
  }
  listeners.forEach((l) => l(req, kind));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useConfirm() {
  return React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      emit({ ...opts, resolve }, "confirm");
    });
  }, []);
}

export function usePrompt() {
  return React.useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      emit({ ...opts, resolve }, "prompt");
    });
  }, []);
}

// ---------------------------------------------------------------------------
// Host — mount once at app root
// ---------------------------------------------------------------------------

export function ConfirmDialogHost() {
  const [confirmReq, setConfirmReq] = React.useState<ConfirmRequest | null>(null);
  const [promptReq, setPromptReq] = React.useState<PromptRequest | null>(null);
  const [promptValue, setPromptValue] = React.useState("");

  React.useEffect(() => {
    const listener: Listener = (req, kind) => {
      if (kind === "confirm") {
        setConfirmReq(req as ConfirmRequest);
      } else {
        const p = req as PromptRequest;
        setPromptValue(p.defaultValue ?? "");
        setPromptReq(p);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  function handleConfirm(ok: boolean) {
    if (!confirmReq) return;
    confirmReq.resolve(ok);
    setConfirmReq(null);
  }

  function handlePrompt(value: string | null) {
    if (!promptReq) return;
    promptReq.resolve(value);
    setPromptReq(null);
  }

  return (
    <>
      <AlertDialog
        open={!!confirmReq}
        onOpenChange={(open) => {
          if (!open) handleConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmReq?.title}</AlertDialogTitle>
            {confirmReq?.description && (
              <AlertDialogDescription>{confirmReq.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirm(false)}>
              {confirmReq?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirmReq?.variant === "destructive" &&
                  buttonVariants({ variant: "destructive" }),
              )}
              onClick={() => handleConfirm(true)}
            >
              {confirmReq?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!promptReq}
        onOpenChange={(open) => {
          if (!open) handlePrompt(null);
        }}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (promptReq?.required && !promptValue.trim()) return;
              handlePrompt(promptValue);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{promptReq?.title}</DialogTitle>
              {promptReq?.description && (
                <DialogDescription>{promptReq.description}</DialogDescription>
              )}
            </DialogHeader>
            <Input
              autoFocus
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptReq?.placeholder}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handlePrompt(null)}>
                {promptReq?.cancelLabel ?? "Cancel"}
              </Button>
              <Button type="submit">{promptReq?.confirmLabel ?? "OK"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
