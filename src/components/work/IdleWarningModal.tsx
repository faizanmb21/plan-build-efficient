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

const GRACE_SEC = 60;

export function IdleWarningModal() {
  const { idleWarning, dismissIdleWarning } = useWorkSession();
  const [secondsLeft, setSecondsLeft] = React.useState(GRACE_SEC);

  React.useEffect(() => {
    if (!idleWarning) {
      setSecondsLeft(GRACE_SEC);
      return;
    }
    setSecondsLeft(GRACE_SEC);
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
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
            {idleWarning === "course" ? "your course" : "the app"}. Please stay
            focused and come back when you're ready — we'll clock you out
            automatically in <span className="font-semibold text-foreground">{secondsLeft}s</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissIdleWarning}>I'm here</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
