import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { scenarios } from "@/api";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const SCENE_TYPE = [
  { name: "Sqouts Agent", value: "SQOUTS" },
  { name: "Pipecat Agent", value: "PIPECAT" },
  { name: "Transcript Evaluation", value: "TRANSCRIPTION" },
];

export function NewScenarioDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [selectEye, setSelectEye] = useState("SQOUTS");

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const created = await scenarios.create({
        name: String(f.get("name")),
        gateway_url: String(f.get("gateway_url")),
        token: String(f.get("token")),
        description: String(f.get("description")),
        ai_role: String(f.get("ai_role")),
        scenario_type: String(f.get("scene_type")),
      });
      setOpen(false);
      navigate(`/scenarios/${created.id}`);
    } catch {
      setError("Couldn't create the scenario. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10">
          <Plus className="size-4" /> Add Scenario
        </Button>
      </DialogTrigger>

      {/* The form lives inside the content: DialogContent renders in a portal, so a
          form wrapped around <Dialog> would not contain these inputs in the DOM. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} key={formKey} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Add a Scenario</DialogTitle>
            <DialogDescription>
              The Sqouts agent you want to test. You can add test cases once
              it's created.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="tc-voice">
              Testee Agent Type<span className=" text-red-700">*</span>
            </FieldLabel>
            <Select
              name="scene_type"
              required
              defaultValue={selectEye}
              onValueChange={(v) => {
                setFormKey((k) => k + 1);
                setSelectEye(v);
              }}
            >
              <SelectTrigger className="h-10! border-2" id="tc-voice">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Agent Types</SelectLabel>
                  {SCENE_TYPE.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field className={`${selectEye === "TRANSCRIPTION" ? 'col-span-2' : null}`}>
              <FieldLabel htmlFor="scn-name">Name<span className=" text-red-700">*</span></FieldLabel>
              <Input
                id="scn-name"
                name="name"
                required
                placeholder="Angry customer: broken rice cooker"
                className="h-10 border-2"
              />
            </Field>
            {selectEye !== "TRANSCRIPTION" && (
              <>
                <Field>
                  <FieldLabel htmlFor="scn-gateway">Gateway URL<span className=" text-red-700">*</span></FieldLabel>
                  <Input
                    id="scn-gateway"
                    name="gateway_url"
                    type="url"
                    required
                    defaultValue={selectEye == "SQOUTS" ? "http://localhost:8010" : ""}
                    className="h-10 border-2"
                  />
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="scn-token">{selectEye == "SQOUTS" ? "Interview Token" : "Authorization Token"}<span className=" text-red-700">*</span></FieldLabel>
                  <Input
                    id="scn-token"
                    name="token"
                    required
                    placeholder="6JQ7N-om_cGNmbw6bsYOgA"
                    className="h-10 border-2 font-mono"
                  />
                  <FieldDescription>
                    The part after /s/ in the agent's open walk-in link.
                  </FieldDescription>
                </Field>
              </>
            )}
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="scn-role">
                {selectEye == "SQOUTS" ? "Sqouts" : "Agent"} Role Description<span className=" text-red-700">*</span>
              </FieldLabel>
              <Textarea
                id="scn-role"
                name="ai_role"
                required
                rows={8}
                placeholder="Character: … Scenario: …"
                className="field-sizing-fixed border-2"
              />
              <FieldDescription>
                The Character and Situation exactly as entered in the Sqouts
                wizard. The judge scores the AI against this.
              </FieldDescription>
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="scn-desc">Scenario Description</FieldLabel>
              <Textarea
                id="scn-desc"
                name="description"
                rows={3}
                placeholder="What this scenario is for, for your teammates"
                className="field-sizing-fixed border-2"
              />
            </Field>
          </div>

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
              {saving ? "Adding…" : "Add Scenario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
