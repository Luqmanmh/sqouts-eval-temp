import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { testcases } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TestCaseFields } from "./test-case-fields";
import { readTestCaseForm } from "@/lib/test-case-form";

export function NewTestCaseDialog({ sceneId, type }: { sceneId: string, type?:string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const created = await testcases.create({
        scenario_id: Number(sceneId),
        ...readTestCaseForm(f, [])
      });
      setOpen(false);
      navigate(`/scenarios/${sceneId}/testcases/${created.id}`);
    } catch {
      setError("Couldn't create the test case. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 border-2" variant="outline">
          <Plus className="size-4" /> New Test Case
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Add New Test Case</DialogTitle>
            <DialogDescription>
              {type !== "TRANSCRIPTION" && "Who the tester bot plays and how its call is scored. "}
              Every run of this test case uses these settings, so runs stay comparable.
            </DialogDescription>
          </DialogHeader>

          <TestCaseFields type={type}/>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setError("")}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" className="h-10" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Adding…" : "Add Test Case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
