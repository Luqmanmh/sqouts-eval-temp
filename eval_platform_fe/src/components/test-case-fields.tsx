import type { TestCase } from "@/api";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
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
import { Switch } from "./ui/switch";

// const voices11 = [
//   { id: "gpzZjtWbZNetDrq8CXKD", name: "Yudo", lang: "ID" },
//   { id: "vLsH4ENK3zGpAuW1lSh4", name: "Ghaisan", lang: "ID" },
//   { id: "WQ4h6sgS9p2XXvLsESBT", name: "Selina", lang: "ID" },
//   { id: "dkQMGaBM8mo3kiErYNOt", name: "Rukmini", lang: "ID" },
//   { id: "giAoKpl5weRTCJK7uB9b", name: "Owen", lang: "EN" },
//   { id: "7EzWGsX10sAS4c9m9cPf", name: "JJ", lang: "EN" },
//   { id: "kdmDKE6EkgrWrrykO9Qt", name: "Alexandra", lang: "EN" },
//   { id: "9BYUod15YOH2aePSd97v", name: "Vanessa", lang: "EN" },
// ];

const voicesCart = [
  {id: "04b567df-2923-4b0c-896b-4b7df0a07e1a", name:"Galang", lang:"ID"},
  {id: "f3b7c445-d015-40f7-a665-9595e0bc0c90", name:"Intan", lang:"ID"},
  {id: "ef191366-f52f-447a-a398-ed8c0f2943a1", name:"Archie", lang:"EN"},
  {id: "a33f7a4c-100f-41cf-a1fd-5822e8fc253f", name:"Lauren", lang:"EN"},
]

/**
 * Every field a test case has, shared by the New Test Case dialog and the test
 * case page so the two can't drift. Uncontrolled: read the values back with
 * `readTestCaseForm` (lib/test-case-form). The selects only read `defaults` when they mount, so
 * render this once the test case has loaded, not before.
 */
export function TestCaseFields({
  defaults,
  type,
}: {
  defaults?: TestCase;
  type?: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="tc-name">
          Test Case Name<span className=" text-red-700">*</span>
        </FieldLabel>
        <Input
          id="tc-name"
          name="name"
          required
          placeholder="Testing with wrong answer"
          className="h-10 border-2"
          defaultValue={defaults?.name}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="tc-lang">
          Language<span className=" text-red-700">*</span>
        </FieldLabel>
        <Select name="language" required defaultValue={defaults?.language}>
          <SelectTrigger className="h-10! border-2" id="tc-lang">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Language</SelectLabel>
              <SelectItem value="id">Indonesian</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {type == "SQOUTS" && (
        <>
          <Field>
            <FieldLabel htmlFor="tc-joinname">
              Join Name<span className=" text-red-700">*</span>
            </FieldLabel>
            <Input
              id="tc-joinname"
              name="join_name"
              required
              placeholder="john-{uid}"
              className="h-10 border-2 font-mono"
              defaultValue={defaults?.join_name}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="tc-joinmail">
              Join Email<span className=" text-red-700">*</span>
            </FieldLabel>
            <Input
              id="tc-joinmail"
              name="join_mail"
              required
              placeholder="john-{uid}@gmail.com"
              className="h-10 border-2 font-mono"
              defaultValue={defaults?.join_email}
            />
          </Field>

          <FieldDescription className="md:col-span-2 -mt-3">
            What the tester types into the Sqouts join form. <code>{"{uid}"}</code>{" "}
            is replaced with the run's id, so every run joins as a new candidate.
          </FieldDescription>
        </>
      )}


      <Field className={`${type === "TRANSCRIPTION" ? "md:col-span-2" : null}`}>
        <FieldLabel htmlFor="tc-passing">
          Passing Score<span className=" text-red-700">*</span>
        </FieldLabel>
        <Input
          id="tc-passing"
          name="pass_threshold"
          type="number"
          min={1}
          max={5}
          required
          defaultValue={defaults?.pass_threshold ?? 4}
          className="h-10 border-2 font-mono"
        />
        <FieldDescription>
          The average judge score (1-5) a run needs to pass. A critical failure
          fails the run whatever the score.
        </FieldDescription>
      </Field>

      {type !== "TRANSCRIPTION" && (
        <>
          <Field>
            <FieldLabel htmlFor="tc-voice">
              Voice Model<span className=" text-red-700">*</span>
            </FieldLabel>
            <Select
              name="voice_id"
              required
              defaultValue={defaults?.voice_id ?? voicesCart[0].id}
            >
              <SelectTrigger className="h-10! border-2" id="tc-voice">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Voices</SelectLabel>
                  {voicesCart.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} - {v.lang}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          

        </>
      )}
      {type !== "TRANSCRIPTION" && (
        <FieldLabel htmlFor="tc-start-first" className="md:col-span-2">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Tester speaks first</FieldTitle>
              <FieldDescription>
                The tester opens the call instead of waiting for the agent's
                greeting. Turn this on for agents that wait for the caller.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="tc-start-first"
              name="start_first"
              defaultChecked={defaults?.start_first ?? false}
            />
          </Field>
        </FieldLabel>
      )}

      {type !== "TRANSCRIPTION" && (
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="tc-bot">
            Tester Persona<span className=" text-red-700">*</span>
          </FieldLabel>
          <Textarea
            id="tc-bot"
            name="bot_char"
            required
            rows={8}
            placeholder="Character: … Information: …"
            className="field-sizing-fixed border-2"
            defaultValue={defaults?.bot_char}
          />
          <FieldDescription>
            Who the tester plays and what they know. The tester stays in
            character and answers Sqouts' questions from this, so anything you
            want it to say has to be written here.
          </FieldDescription>
        </Field>
      )}
    </div>
  );
}
