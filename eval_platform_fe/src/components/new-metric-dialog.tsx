import { useState, type SubmitEvent } from "react";
import { isAxiosError } from "axios";
import { Loader2, PenBox, Plus } from "lucide-react";
import { metrics, type Metrics } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** "Refund promise check" → "refund_promise_check" */
const toKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export function NewMetricDialog({
  met,
  onCreated,
}: {
  met: Metrics | null;
  /** gets the saved metric, so the page can add it to its list and pick it */
  onCreated: (m: Metrics) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyError, setKeyError] = useState("");
  const [name, setName] = useState(met?.name || "");
  // The key follows the name until someone types in it themselves.
  const [key, setKey] = useState(met?.key || "");
  const [keyEdited, setKeyEdited] = useState(false);
  const [critical, setCritical] = useState(met?.critical || false);

  function reset() {
    setName(met?.name || "");
    setKey(met?.key || "");
    setKeyEdited(false);
    setCritical(met?.critical || false);
    setError("");
    setKeyError("");
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    // The dialog renders in a portal, but React still bubbles its submit to
    // the test case form it was opened from. Stop it there.
    e.stopPropagation();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    setKeyError("");
    try {
      if (met) {
        const created = await metrics.update({
          id: met.id,
          name: name.trim(),
          key,
          max_score: met.max_score,
          description: String(f.get("description")).trim(),
          critical,
        });
        onCreated(created.data);
      } else {
        const created = await metrics.create({
          name: name.trim(),
          key,
          description: String(f.get("description")).trim(),
          critical,
        });
        onCreated(created);
      }

      setOpen(false);
      if (!met) reset();
    } catch (err) {
      const fieldErr = isAxiosError(err)
        ? err.response?.data?.details?.key?.[0]
        : undefined;
      if (fieldErr) setKeyError(fieldErr);
      else
        setError("Couldn't create the metric. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-10 border-2">
          {met ? (
            <PenBox />
          ) : (
            <span className="flex items-center">
              <Plus className="size-4" /> New Metric
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-xl">New Metric</DialogTitle>
            <DialogDescription>
              Something the judge scores from 1 to 5 after each call. It's saved
              to your metrics, so you can pick it for any of your test cases.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="mt-name">
                Name<span className=" text-red-700">*</span>
              </FieldLabel>
              <Input
                id="mt-name"
                required
                maxLength={100}
                placeholder="Refund promise check"
                className="h-10 border-2"
                value={name}
                defaultValue={met?.name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!keyEdited) setKey(toKey(e.target.value));
                }}
              />
            </Field>

            <Field data-invalid={!!keyError || undefined}>
              <FieldLabel htmlFor="mt-key">
                Key<span className=" text-red-700">*</span>
              </FieldLabel>
              <Input
                id="mt-key"
                required
                maxLength={60}
                pattern="[a-z0-9_]+"
                title="Lowercase letters, numbers and underscores only"
                placeholder="refund_promise_check"
                className="h-10 border-2 font-mono"
                defaultValue={met?.key}
                aria-invalid={!!keyError || undefined}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setKeyEdited(true);
                  setKeyError("");
                }}
              />
              {keyError ? (
                <FieldError>{keyError}</FieldError>
              ) : (
                <FieldDescription>
                  What the judge reports the score as. Filled in from the name.
                </FieldDescription>
              )}
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="mt-desc">
                Rubric<span className=" text-red-700">*</span>
              </FieldLabel>
              <Textarea
                id="mt-desc"
                name="description"
                required
                rows={5}
                defaultValue={met?.description}
                placeholder="Did the agent avoid promising refunds outside the return policy? 1 = promised one outright, 5 = held the policy and offered what it allows."
                className="field-sizing-fixed border-2"
              />
              <FieldDescription>
                What the judge scores against, and all it sees of this metric.
                Say what a 1 and a 5 look like.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal" className="md:col-span-2">
              <Checkbox
                id="mt-critical"
                checked={critical}
                onCheckedChange={(c) => setCritical(c === true)}
                defaultChecked={met?.critical}
              />
              <FieldContent>
                <FieldLabel htmlFor="mt-critical">Critical</FieldLabel>
                <FieldDescription>
                  Failing this metric fails the run, whatever the average.
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-10">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" className="h-10" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Adding…" : (met ? "Save Metric" : "Add Metric")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
