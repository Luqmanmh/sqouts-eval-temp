import { http, saveProfile, clearProfile } from "@/lib/http";

// Every URL the app knows lives in this file. A route rename is one edit here,
// not a grep across pages — which is the whole reason this layer exists.
//
// Shapes mirror api/models.py. Paths under `scenarios` and `runs` are the ones
// api/urls.py still has to register (urlpatterns is empty today); auth/login and
// auth/refresh match LoginView and TokenRefreshCookieView as written.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserList {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  last_login: string | null;
}

export interface UserSecret {
  username: string;
  email: string;
  password?: string;
}

export interface Profile {
  username: string;
  userid: number;
  is_admin: boolean;
}

export interface Scenario {
  id: number;
  name: string;
  description: string;
  /** the Sqouts gateway this scenario drives, e.g. http://localhost:8010 */
  gateway_url: string;
  /** share-link token the run joins with */
  token: string;
  ai_role: string;
  scenario_type: string;
}

export type ScenarioInput = Omit<Scenario, "id">;

export interface Run {
  id: string;
  status: string;
  finish_time: string | null;
  /** LLM entries are tokens; tts_chars is Cartesia characters. A transcript run only has eval_*. */
  token_count: Partial<Record<"reply_in" | "reply_out" | "eval_in" | "eval_out" | "tts_chars", number>>;
  pass_threshold: number;
  scenario_type: string;
  has_recording: boolean;
  eval_res: EvalRes | null;
  transcript: Transcript[] | null;
  plain: string[] | null;
}

/** What the judge writes to eval_res-<run id>.json. */
export interface EvalRes {
  overall_score: number;
  passed: boolean;
  /** 1-5 per metric, keyed by metric key */
  metric_scores: Record<string, number>;
  /** the judge's reason for each score, keyed by metric key */
  metric_evidence: Record<string, string>;
  critical_failures: string[];
  strengths: string[] | [];
  weaknesses: string[] | [];
  overall_feedback: string;
  most_important_improvement: string;
  /** the metrics as they were when the run was scored */
  metrics?: Pick<Metrics, "id" | "key" | "name" | "description" | "critical">[];
}

export interface Transcript {
  speaker: string;
  text: string;
  plain: number;
}

export interface Paged<T> {
  data: T[];
  pagin: {
    current_page: number;
    page_len: number;
    total_items: number;
    total_page: number;
  };
}

export interface ScenarioListItem {
  id: number;
  name: string;
  description: string;
  gateway_url: string;
  token: string;
  test_case_count: number;
  latest_test_done: string | null;
  scenario_type: string;
}

/** One row of a scenario's test case table (TestCaseListSerializer). */
export interface TestCaseListItem {
  id: number;
  name: string;
  language: string;
  /** latest DONE run; null until the test case has finished one */
  last_run: {
    id: string;
    finished_at: string;
    /** null when the run's result file is missing or unreadable */
    passed: boolean | null;
    overall_score: number | null;
  } | null;
}

export interface TestCase {
  id: number;
  scenario_id: number;
  scenario_type: string;
  name: string;
  bot_char: string;
  language: string;
  voice_id: string;
  join_name: string;
  join_email: string;
  metrics: number[];
  pass_threshold: number;
  start_first: boolean;
}

export type TestCaseInput = Omit<TestCase, "id" | "scenario_type">;

/** One row of a test case's run table (RunListSerializer). */
export interface RunListItem {
  id: string;
  status: "PREPARING" | "RUNNING" | "DONE" | "ABORTED";
  finish_time: string | null;
  /** null until the judge has written a verdict */
  passed: boolean | null;
  overall_score: number | null;
}

export interface DetailResponse<T> {
  detail: string;
  data: T;
}

export interface Metrics {
  id: number;
  key: string;
  name: string;
  description: string;
  max_score: number;
  critical: boolean;
}

export type MetricInput = Pick<
  Metrics,
  "key" | "name" | "description" | "critical"
>;

/** The four artifacts link_eval_client.py writes per run. */
export type RunArtifact = "eval_res" | "events_log" | "plain" | "transcript";

/** One moment of a call, from timeline_items in api/scripts/local_scripts.py. */
export interface TimelineItem {
  /** seconds since the call connected */
  t: number;
  kind:
    | "bot_start"
    | "bot_stop"
    | "bot_said"
    | "tester_start"
    | "heard"
    | "sent"
    | "held"
    | "cut"
    | "sqouts_error"
    | "error"
    | "state_connected"
    | "bot_ready"
    | "client_ready"
    | "bot_started_thinking"
    | "bot_stopped_thinking"
    | "state_connecting";
  text?: string;
  /** bot_start only */
  flag?: "nudge" | "interrupt";
  /** bot_start nudges: how long the tester had been quiet */
  silent?: number;
  /** tester_start: seconds since Sqouts stopped */
  gap?: number | null;
  /** position in the recording, in seconds */
  rec?: number;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const auth = {
  login: async (username: string, password: string, persists: boolean) => {
    // LoginView sets both JWTs as httpOnly cookies and echoes the profile.
    // Only the profile is kept, and only as a route-gating hint — the server
    // re-checks the cookie on every call, so a tampered localStorage buys
    // nothing but a 401.
    const { data } = await http.post<Profile>("auth/login", {
      username: username,
      password: password,
      persists: persists,
    });
    saveProfile(data);
    return data;
  },
  logout: async () => {
    // The cookies are httpOnly, so only the server can clear them.
    try {
      await http.post("auth/logout");
    } finally {
      clearProfile();
    }
  },
  // me: async () => {
  //   const { data } = await http.get<Profile>("auth/me");
  //   saveProfile(data);
  //   return data;
  // },
};

export const userManage = {
  list: async (params?: { query?: string; page?: number }) =>
    (await http.get<Paged<UserList>>("usermanage/list", { params })).data,
  saveStatus: async (id: number, staff: boolean, active: boolean) =>
    await http.put(`usermanage/singles/${id}`, { staff, active }),
  delete: async (id: number) => await http.delete(`usermanage/singles/${id}`),
  changePass: async (id: number, randomize?: boolean, newpass?: string) =>
   ( await http.patch<UserSecret>(`usermanage/singles/${id}`, {randomize, newpass,})).data,
  create: async(input:UserSecret, randomize:boolean)=> (await http.post<UserSecret>("usermanage/create", {...input, randomize})).data,
};

export const scenarios = {
  list: async (params?: { query?: string; page?: number }) =>
    (await http.get<Paged<ScenarioListItem>>("scenarios/list", { params }))
      .data,

  get: async (id: string) => (await http.get<Scenario>(`scenarios/${id}`)).data,

  create: async (input: ScenarioInput) =>
    (await http.post<Scenario>("scenarios", input)).data,

  update: async (id: number, input: Partial<ScenarioInput>) =>
    (await http.put<DetailResponse<Scenario>>(`scenarios/${id}`, input)).data,

  delete: async (id: number) => {
    await http.delete(`scenarios/${id}`);
  },

  /** Runs belonging to one scenario. */
  runs: async (id: number) =>
    (await http.get<Run[]>(`scenarios/${id}/runs/`)).data,
};

export const testcases = {
  /** A scenario's test cases, paged and searchable like `list`. */
  list: async (
    id: number | string,
    params?: { query?: string; page?: number },
  ) =>
    (
      await http.get<Paged<TestCaseListItem>>(`testcases/list/${id}`, {
        params,
      })
    ).data,

  create: async (input: TestCaseInput) =>
    (await http.post<TestCase>("testcases", input)).data,

  get: async (id: string) => (await http.get<TestCase>(`testcases/${id}`)).data,

  update: async (
    id: number,
    input: Partial<Omit<TestCaseInput, "scenario_id">>,
  ) =>
    (await http.put<DetailResponse<TestCase>>(`testcases/${id}`, input)).data,

  delete: async (id: number) => {
    await http.delete(`testcases/${id}`);
  },

  /** A test case's runs, newest first. */
  runs: async (id: number | string, params?: { page?: number }) =>
    (await http.get<Paged<RunListItem>>(`testcases/${id}/runs`, { params }))
      .data,
};

export const runs = {
  list: async (filters?: { scenario_id?: number; passed?: boolean }) =>
    (await http.get<Run[]>("runs/", { params: filters })).data,

  get: async (id: string) => (await http.get<Run>(`runs/${id}`)).data,

  delete: async (id: string) => {
    await http.delete(`runs/${id}`);
  },

  recording: async (id: string) =>
    (await http.get<Blob>(`runs/${id}/recording`, { responseType: "blob" }))
      .data,

  /** The call as a timeline; DONE and ABORTED runs only. */
  events: async (id: string) =>
    (await http.get<{ items: TimelineItem[] }>(`runs/${id}/events`)).data.items,
};

export const metrics = {
  getBuilt: async () => (await http.get<Metrics[]>("metrics/built")).data,
  getSelf: async () => (await http.get<Metrics[]>("metrics/self")).data,

  create: async (input: MetricInput) =>
    (await http.post<Metrics>("metrics/self", input)).data,

  update: async (input: Metrics) =>
    (await http.put<DetailResponse<Metrics>>("metrics/self", input)).data,
};

export const call = {
  startcall: async (id: number, count: number) =>
    (await http.post<string[]>(`call/startrun/${id}`, { count })).data,
  /** Upload a transcript to judge. No Content-Type here: axios sets
   *  multipart/form-data with the boundary itself. */
  transcript: async (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return (await http.post<{ id: string }>(`call/transcript/${id}`, form))
      .data;
  },
};
