import { DynamicCrumb } from "@/components/dynamic-crumb";
import { useLocation, useParams } from "react-router-dom";
import {
  call,
  metrics,
  testcases,
  type Metrics,
  type Paged,
  type RunListItem,
  type TestCase,
} from "@/api";
import { useEffect, useState, type SubmitEvent } from "react";
import { FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CircleSlash, Loader2, Play } from "lucide-react";
import { TestCaseFields } from "@/components/test-case-fields";
import { readTestCaseForm } from "@/lib/test-case-form";
import { RunTable } from "@/components/run-table";
import { Pager } from "@/components/pager";
import { NewMetricDialog } from "@/components/new-metric-dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RunTranscriptionDialog } from "@/components/run-transcription-dialog";
import { DeleteRowDialog } from "@/components/delete-row-dialog";

export function TestCaseDetail() {
  const { tcid } = useParams();
  const loc = useLocation();
  const [testCase, setTestCase] = useState<TestCase>();
  const [savedtestCase, setsavedTestCase] = useState<TestCase>();
  const [runCount, setRunCount] = useState(2);
  const [builtMetrics, setBuiltMetrics] = useState<Metrics[]>([]);
  const [selfMetrics, setSelfMetrics] = useState<Metrics[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<Paged<RunListItem> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [runFetch, setRunFetch] = useState(0);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const upd = await testcases.update(
        testCase!.id,
        readTestCaseForm(f, testCase!.metrics),
      );
      setTestCase(upd.data);
      setsavedTestCase(upd.data);
      setDirty(false);
    } catch {
      setError("Couldn't save the test case. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartRun(tcid: string, count: number) {
    setStarting(true);
    setError("");
    try {
      await call.startcall(Number(tcid), count);
      setPage(1); // refetch the runs table so the new ones show up
      setRunFetch((k) => k + 1);
    } catch {
      setError("Couldn't start the runs.");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    let ignore = false; // stops an old, slow response overwriting a newer one

    async function load() {
      setError("");
      try {
        const res = await testcases.get(tcid!);
        if (!ignore) {
          setTestCase(res);
          setsavedTestCase(res);
        }
      } catch {
        if (!ignore) setError("Couldn't load the test case.");
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [tcid]);

  // Runs: refetch whenever the page changes.
  useEffect(() => {
    let ignore = false;

    async function load() {
      setRunsLoading(true);
      try {
        const builtRes = await metrics.getBuilt();
        const selfRes = await metrics.getSelf();
        if (!ignore) {
          setBuiltMetrics(builtRes);
          setSelfMetrics(selfRes);
        }
      } catch {
        if (!ignore) setError("Couldn't load runs.");
      } finally {
        if (!ignore) setRunsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [tcid]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setRunsLoading(true);
      try {
        const res = await testcases.runs(tcid!, { page });
        if (!ignore) {
          setRuns(res);
        }
      } catch {
        if (!ignore) setError("Couldn't load runs.");
      } finally {
        if (!ignore) setRunsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [tcid, page, runFetch]);

  function discard() {
    setTestCase(savedtestCase);
    setFormKey((k) => k + 1);
    setDirty(false);
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const available = selfMetrics.filter(
    (m) => !testCase!.metrics.includes(m.id),
  );
  const picked = selfMetrics.filter((m) => testCase!.metrics.includes(m.id));
  const pickBuilt = builtMetrics.filter((m) =>
    testCase!.metrics.includes(m.id),
  );

  if(!testCase){
    return(
      <div>
      <DynamicCrumb url={loc.pathname} />
      <div className="w-full mt-6">
          <Loader2 size={57} className="animate-spin text-primary mx-auto"/>
        </div>
      </div>
    )
  }

  return (
    <div>
      <DynamicCrumb url={loc.pathname} />
      <div className="mb-4 mt-2 flex items-start justify-between gap-4">
        <h1 className="text-3xl">{testCase?.name}</h1>
        <DeleteRowDialog type="test case" prevId={[testCase?.scenario_id]} id={testCase?.id}/>
      </div>

      <div className="border-2 p-6 rounded-2xl">
        <div className="mb-4">
          <h2 className="text-lg">Test case setup</h2>
          <p className=" text-sm text-gray-500">
            Who the tester bot plays and how its call is scored. Changes apply
            from the next run; past runs keep their results.
          </p>
        </div>
        {testCase ? (
          // keyed so a saved or newly loaded test case remounts the selects,
          // which only read their default value once
          <form
            key={formKey}
            onSubmit={onSubmit}
            onChange={() => setDirty(true)}
          >
            <FieldGroup>
              <TestCaseFields
                defaults={testCase}
                type={testCase.scenario_type}
              />

              <div>
                <p className="text-sm font-medium">Metrics the judge scores</p>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-left text-sm leading-normal font-normal text-muted-foreground">
                    Built-in metrics come with Eval Bot. Metrics you add are
                    yours: edit them here and pick them for any of your test
                    cases.
                  </p>
                  <NewMetricDialog
                    met={null}
                    onCreated={(m) => {
                      // add it to the list and pick it for this test case
                      setSelfMetrics((prev) => [...prev, m]);
                      setTestCase(
                        (prev) =>
                          prev && { ...prev, metrics: [...prev.metrics, m.id] },
                      );
                    }}
                  />
                </div>
                {/* <p>{testCase.metrics}</p> */}
                <div className="mt-2">
                  <Combobox
                    items={available}
                    itemToStringLabel={(m: Metrics) =>
                      `${m.name} ${m.key} ${m.description}`
                    }
                    value={null}
                    onValueChange={(m: Metrics | null) => {
                      if (!m) return;
                      setTestCase(
                        (prev) =>
                          prev && { ...prev, metrics: [...prev.metrics, m.id] },
                      );
                      setDirty(true)
                    }}
                  >
                    <ComboboxInput
                      placeholder="Search for your metric"
                      className="h-10 border-2"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No metrics match.</ComboboxEmpty>
                      <ComboboxList>
                        {(metric: Metrics) => (
                          <ComboboxItem key={metric.id} value={metric}>
                            <div className="py-2 px-3 flex justify-between items-center w-full">
                              <div>
                                <p className="text-sm font-medium">
                                  {metric.name} • {metric.key}{" "}
                                  {metric.critical && (
                                    <Badge variant="destructive">
                                      Critical
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-left text-sm leading-normal font-normal text-muted-foreground line-clamp-1">
                                  {metric.description}
                                </p>
                              </div>
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
                <div className=" mt-3 rounded-2xl border-2">
                  {/* custom metrics */}
                  <div className="">
                    <p className="text-sm font-medium text-accent-foreground px-2 bg-muted rounded-t-2xl py-2">
                      YOUR METRIC • {picked.length}{" "}
                      <span className="text-muted-foreground text-xs">
                        picked
                      </span>
                    </p>
                    {picked.length > 0 ? (
                      picked.map((pick) => (
                        <div className="p-2 flex justify-between items-center w-full hover:bg-accent">
                          <div>
                            <p className="text-sm font-medium">
                              {pick.name} • {pick.key}{" "}
                              {pick.critical && (
                                <Badge variant="destructive">Critical</Badge>
                              )}
                            </p>
                            <p className="text-left text-sm leading-normal font-normal text-muted-foreground line-clamp-1">
                              {pick.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <NewMetricDialog
                              met={pick}
                              onCreated={(m) => {
                                setSelfMetrics((prevMetrics) =>
                                  prevMetrics.map((em) =>
                                    em.id === m.id ? m : em,
                                  ),
                                );
                                setFormKey((k) => k + 1);
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="bg-transparent hover:bg-red-100 hover:text-red-600 h-10 border-2"
                              onClick={() => {
                                setTestCase((prev) => {
                                  if (!prev) return prev;

                                  return {
                                    ...prev,
                                    metrics: prev.metrics.filter(
                                      (id) => id !== pick.id,
                                    ),
                                  };
                                });
                                setDirty(true);
                              }}
                            >
                              <CircleSlash />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-2 py-3 flex justify-center text-muted-foreground items-center w-full">
                        You have not set a custom metric for this test case
                      </div>
                    )}
                  </div>
                  {/* builtin metric */}
                  <div>
                    <p className="text-sm font-medium text-accent-foreground px-2 bg-muted py-2">
                      BUILTIN METRIC • {pickBuilt.length}{" "}
                      <span className="text-muted-foreground text-xs">
                        picked
                      </span>
                    </p>
                    <div className="relative max-h-80 overflow-auto">
                      {builtMetrics.map((pick) => (
                        <div className="py-3 px-2 flex justify-between items-center w-full hover:bg-accent">
                          <Checkbox
                            id={`check-${pick.id}`}
                            className="mt-0.5 border-2"
                            checked={pickBuilt.includes(pick)}
                            onCheckedChange={(c) =>
                              setTestCase(
                                (prev) =>
                                  prev && {
                                    ...prev,
                                    metrics:
                                      c === true
                                        ? [...prev.metrics, pick.id]
                                        : prev.metrics.filter(
                                            (m) => m !== pick.id,
                                          ),
                                  },
                              )
                            }
                          />
                          <Label
                            htmlFor={`check-${pick.id}`}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="ml-2">
                              <p className="text-sm font-medium">
                                {pick.name} • {pick.key}{" "}
                                {pick.critical && (
                                  <Badge variant="destructive">Critical</Badge>
                                )}
                              </p>
                              <p className="text-left text-sm leading-normal font-normal text-muted-foreground line-clamp-1">
                                {pick.description}
                              </p>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {/* <div className="w-full justify-end flex">
                <Button type="submit" className="h-10" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? "Saving" : "Save Test Case"}
                </Button>
              </div> */}
            </FieldGroup>
            {dirty && (
              <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-xl border-2 bg-background p-3 shadow-lg">
                <span className="text-sm">Unsaved changes</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={discard}>
                    Discard
                  </Button>
                  <Button type="submit" disabled={saving}>
                    Save test case
                  </Button>
                </div>
              </div>
            )}
          </form>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <Loader2 className="mx-auto mt-6 animate-spin text-primary" size={57}/>
        )}
      </div>

      <div className="mt-8">
        <div className="flex justify-between">
          <h2 className="text-lg">Runs</h2>
          {testCase?.scenario_type !== "TRANSCRIPTION" ? (
            <div className="flex gap-4 justify-end items-center">
              <span className="text-muted-foreground">Iterations</span>
              <Input
                type="number"
                min={1}
                max={10}
                className="w-20"
                defaultValue={runCount}
                onChange={(e) => setRunCount(Number(e.target.value))}
              />
              <Button
                onClick={() => handleStartRun(tcid!, runCount)}
                disabled={starting || runCount < 1 || runCount > 10 || !((picked.length + pickBuilt.length) > 0)}
              >
                {starting ? <Loader2 className="animate-spin" /> : <Play />}{" "}
                Start Runs
              </Button>
            </div>
          ) : (
            <>
            <RunTranscriptionDialog
              testCaseId={Number(tcid)}
              canRun={(picked.length + pickBuilt.length) > 0}
              onStarted={() => {
                setPage(1); // refetch the runs table so the new run shows up
                setRunFetch((k) => k + 1);
              }}
            />
            </>
          )}
          
        </div>
        <div className="mt-4">
          <RunTable rows={runs?.data ?? []} loading={runsLoading} />
          <Pager
            className="mt-4"
            page={page}
            length={runs?.pagin.total_page ?? 0}
            onChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
