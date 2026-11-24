import type { TestCaseInput } from "@/api";
export function readTestCaseForm(
  f: FormData,
  mArr: number[]
): Omit<TestCaseInput, "scenario_id" | "scenario_type"> {
  const text = (key: string) => (f.get(key) as string | null) ?? "";
  return {
    name: text("name"),
    bot_char: text("bot_char"),
    language: text("language"),
    voice_id: text("voice_id"),
    join_name: text("join_name"),
    join_email: text("join_mail"),
    pass_threshold: Number(f.get("pass_threshold")),
    // a checked Switch submits "on"; an unchecked one submits nothing
    start_first: f.get("start_first") === "on",
    metrics: mArr,
  };
} 