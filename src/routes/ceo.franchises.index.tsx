import { createFileRoute } from "@tanstack/react-router";
import { Route as DashboardRoute } from "./ceo.index";

// /ceo/franchises renders the same unified CEO overview as /ceo.
// They share the dashboard component (KPIs, incharge & members snapshot,
// franchise cards, invites, course bottlenecks, attention, scorecard).

const DashboardComponent = DashboardRoute.options.component as React.ComponentType;

export const Route = createFileRoute("/ceo/franchises/")({
  component: DashboardComponent,
});
