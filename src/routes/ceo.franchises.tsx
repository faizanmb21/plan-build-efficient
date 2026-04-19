import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ceo/franchises")({
  component: FranchisesLayout,
});

function FranchisesLayout() {
  return <Outlet />;
}
