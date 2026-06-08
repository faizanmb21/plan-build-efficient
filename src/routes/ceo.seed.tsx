import { createFileRoute, redirect } from "@tanstack/react-router";

// Seed route removed before MVP launch — redirects to CEO dashboard
export const Route = createFileRoute("/ceo/seed")({
  beforeLoad: () => {
    throw redirect({ to: "/ceo" });
  },
  component: () => null,
});
