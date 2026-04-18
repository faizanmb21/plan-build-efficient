import * as React from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  LogOut,
  Menu,
  User as UserIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface AppShellProps {
  nav: NavItem[];
  roleLabel: string;
  children: React.ReactNode;
}

export function AppShell({ nav, roleLabel, children }: AppShellProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarInner nav={nav} roleLabel={roleLabel} />
      </aside>

      {/* Sidebar — mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <aside className="relative flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground animate-slide-in-right">
            <button
              className="absolute right-3 top-3 rounded p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarInner nav={nav} roleLabel={roleLabel} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded p-1.5 hover:bg-muted lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm text-muted-foreground">
              {nav.find((n) => location.pathname === n.to || location.pathname.startsWith(n.to + "/"))?.label ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
                <UserIcon className="h-4 w-4" />
              </div>
              <span className="hidden max-w-[140px] truncate sm:inline">
                {profile?.full_name ?? "Profile"}
              </span>
            </Link>
            <Button size="sm" variant="ghost" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main key={location.pathname} className="flex-1 overflow-x-hidden p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

function SidebarInner({
  nav,
  roleLabel,
  onNavigate,
}: {
  nav: NavItem[];
  roleLabel: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">IRM Academy</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
            {roleLabel}
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-sidebar-primary-foreground/80" />
              )}
              <Icon className={cn("h-4 w-4 transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
