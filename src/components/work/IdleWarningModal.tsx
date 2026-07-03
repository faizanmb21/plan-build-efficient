import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkSession } from "@/hooks/use-work-session";
import { Coffee } from "lucide-react";

export function IdleWarningModal() {
  const { idleWarning, dismissIdleWarning } = useWorkSession();
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  // The countdown tracks the engine's REAL deadline — the same timestamp the
  // auto clock-out fires on — so what the member sees is always the truth and
  // clicking the button before 0 always saves the session.
  React.useEffect(() => {
    if (!idleWarning) return;
    const update = () =>
      setSecondsLeft(Math.max(0, Math.ceil((idleWarning.deadline - Date.now()) / 1000)));
    update();
    const t = window.setInterval(update, 250);
    return () => window.clearInterval(t);
  }, [idleWarning]);

  const open = !!idleWarning;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-400" />
            Are you still there?
          </AlertDialogTitle>
          <AlertDialogDescription>
            We noticed you've been away from{" "}
            {idleWarning?.kind === "course" ? "your course" : "the app"}. Click
            the button (or just move your mouse) to keep your session running —
            otherwise we'll clock you out in{" "}
            <span className="font-semibold text-foreground">{secondsLeft}s</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissIdleWarning}>I'm here</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
