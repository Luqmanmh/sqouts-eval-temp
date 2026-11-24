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
import {
  Field,
  FieldContent,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "./ui/button";
import { Loader2, Play } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { call } from "@/api";

export function RunTranscriptionDialog({
  testCaseId,
  canRun,
  onStarted,
}: {
  testCaseId: number;
  /** false until the test case has at least one metric to score against */
  canRun: boolean;
  /** called after the upload succeeds, e.g. to refetch the runs table */
  onStarted?: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a transcript file first.");
      return;
    }
    setStarting(true);
    setError("");
    try {
      await call.transcript(testCaseId, file);
      setOpen(false);
      onStarted?.();
    } catch {
      setError("Couldn't upload the transcript. Check the file and try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!canRun}>
          <Play />
          Start Run
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Upload Your Transcript
            </DialogTitle>
            <DialogDescription>
              Upload the transcript of the call you want to evaluate here.
              follow the example for a better result
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldContent>
              <Input type="file" name="file" accept=".json" required />
              <FieldDescription className="text-sm">
                Accepts: .json
              </FieldDescription>
            </FieldContent>
          </Field>

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
                disabled={starting}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" className="h-10" disabled={starting}>
              {starting && <Loader2 className="size-4 animate-spin" />}
              {starting ? "Uploading…" : "Upload and Run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
