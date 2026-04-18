import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, BookOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ceo/courses/")({
  component: CoursesPage,
});

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published";
  thumbnail_url: string | null;
  updated_at: string;
}

function CoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,description,status,thumbnail_url,updated_at")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setCourses(data ?? []);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("courses")
      .insert({ title: title.trim(), description: description.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setTitle("");
    setDescription("");
    toast.success("Course created");
    navigate({ to: "/ceo/courses/$id/edit", params: { id: data.id } });
  }

  async function deleteCourse(id: string) {
    if (!confirm("Delete this course and all its content?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Build courses with sections, lessons, quizzes and practicals.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New course
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createCourse} className="space-y-4">
              <DialogHeader>
                <DialogTitle>New course</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Customer onboarding fundamentals"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional summary"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create & edit"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No courses yet. Create your first one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{c.title}</CardTitle>
                <Badge variant={c.status === "published" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {c.description || "No description"}
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/ceo/courses/$id/edit" params={{ id: c.id }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCourse(c.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
