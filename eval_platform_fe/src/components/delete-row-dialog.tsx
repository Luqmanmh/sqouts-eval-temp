import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { useState } from "react";
import { runs, scenarios, testcases } from "@/api";
import { useNavigate } from "react-router-dom";

export function DeleteRowDialog({
  type,
  prevId,
  id,
}: {
  type: string;
  prevId?: number[];
  id: number | string;
}) {
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  async function handleDelete() {
    let remove: () => Promise<void>;
    let navTarg: string;
    if (type === "scenario") {
      remove = () => scenarios.delete(Number(id));
      navTarg = "/scenarios";
    } else if (type === "test case") {
      remove = () => testcases.delete(Number(id));
      navTarg = `/scenarios/${prevId![0]}`;
    } else {
      remove = () => runs.delete(String(id));
      navTarg = `/scenarios/${prevId![0]}/testcases/${prevId![1]}`;
    }

    setSaving(true);
    try {
      await remove();
      navigate(navTarg);
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" className="h-10 shrink-0">
          <Trash2 />
          Delete {type}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure to delete this {type}?</DialogTitle>
          <DialogDescription>
            Doing this will permanently delete this{" "}
            {type === "scenario" && "Scenario including the"}{" "}
            {type !== "run" &&
              `test case${type === "test case" ? "" : "s"} and`}{" "}
            run{type !== "run" && "s under this"}.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-10">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            onClick={() => {
              handleDelete();
            }}
            className="h-10 bg-destructive hover:bg-red-800"
            disabled={saving}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Deleting..." : `Delete ${type}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
