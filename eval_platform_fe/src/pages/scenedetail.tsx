import { DynamicCrumb } from "@/components/dynamic-crumb";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  scenarios,
  testcases,
  type Paged,
  type Scenario,
  type TestCaseListItem,
} from "@/api";
import { useEffect, useState, type SubmitEvent } from "react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
// import { Loader2 } from "lucide-react";
import { TestCaseTable } from "@/components/test-case-table";
import { Pager } from "@/components/pager";
import { NewTestCaseDialog } from "@/components/new-test-case-dialog";
import { Loader2 } from "lucide-react";
import { DeleteRowDialog } from "@/components/delete-row-dialog";

export function SceneDetail() {
  const navigate = useNavigate();
  const { sceneid } = useParams();
  const loc = useLocation();
  const [sceneDetail, setSceneDetail] = useState<Scenario>();
  const [savedsceneDetail, setSavedSceneDetail] = useState<Scenario>();
  const [searchVal, setSearchVal] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testCases, setTestCases] = useState<Paged<TestCaseListItem> | null>(
    null,
  );
  const [tcLoading, setTcLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function toTestCase(id: number) {
    navigate(`/scenarios/${sceneid}/testcases/${id}`);
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const upd = await scenarios.update(sceneDetail!.id, {
        name: String(f.get("name")),
        gateway_url: String(f.get("gateway_url")),
        token: String(f.get("token")),
        description: String(f.get("description")),
        ai_role: String(f.get("ai_role")),
      });
      setSceneDetail(upd.data);
      setSavedSceneDetail(upd.data);
      setDirty(false);
    } catch {
      setError("Couldn't create the scenario. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    console.log(error);
  }, [error]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchVal);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchVal]);

  useEffect(() => {
    let ignore = false; // stops an old, slow response overwriting a newer one

    async function load() {
      // setLoading(true);
      setError("");
      try {
        const res = await scenarios.get(sceneid!);
        if (!ignore) {
          setSceneDetail(res);
          setSavedSceneDetail(res);
        }
      } catch {
        if (!ignore) {
          setError("Couldn't load scenarios.");
        }
      }
      // finally {
      //   if (!ignore) setLoading(false);
      // }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [sceneid]);

  // Test cases: refetch whenever the search or page changes.
  useEffect(() => {
    let ignore = false; // stops an old, slow response overwriting a newer one

    async function load() {
      setTcLoading(true);
      try {
        const res = await testcases.list(sceneid!, { query, page });
        if (!ignore) setTestCases(res);
      } catch {
        if (!ignore) setError("Couldn't load test cases.");
      } finally {
        if (!ignore) setTcLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [sceneid, query, page]);

  function discard() {
    setSceneDetail(savedsceneDetail);
    setFormKey((k) => k + 1);
    setDirty(false);
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if(!sceneDetail){
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
        <h1 className="text-3xl">{sceneDetail?.name}</h1>
        {/* TODO: confirm, then delete this scenario and navigate away */}
        <DeleteRowDialog type="scenario" prevId={[-1]} id={sceneDetail.id}/>
      </div>

      <div className="border-2 p-6 rounded-2xl">
        <div className="mb-4">
          <h2 className="text-lg">Scenario setup</h2>
          <p className=" text-sm text-gray-500">
            {sceneDetail?.scenario_type === "SQOUTS" ? "The Sqouts" : "Your"} agent under test. Changes apply to every test case from
            its next run.
          </p>
        </div>
        <form onSubmit={onSubmit} key={formKey} onChange={() => setDirty(true)}>
          <FieldGroup>
            <div className="md:grid grid-cols-3 gap-4">
              <Field className={`${sceneDetail?.scenario_type === "TRANSCRIPTION" ? 'col-span-3' : null}`}>
                <FieldLabel>
                  Name<span className=" text-red-700">*</span>
                </FieldLabel>
                <Input
                  id="scn-name"
                  name="name"
                  required
                  placeholder="Angry customer: broken rice cooker"
                  className="h-10 border-2"
                  defaultValue={sceneDetail?.name}
                />
              </Field>
              {sceneDetail?.scenario_type !== "TRANSCRIPTION" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="scn-gateway">
                      Gateway URL<span className=" text-red-700">*</span>
                    </FieldLabel>
                    <Input
                      id="scn-gateway"
                      name="gateway_url"
                      type="url"
                      required
                      defaultValue={sceneDetail?.gateway_url}
                      className="h-10 border-2"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="scn-token">
                      Interview Token<span className=" text-red-700">*</span>
                    </FieldLabel>
                    <Input
                      id="scn-token"
                      name="token"
                      required
                      placeholder="6JQ7N-om_cGNmbw6bsYOgA"
                      className="h-10 border-2 font-mono"
                      defaultValue={sceneDetail?.token}
                    />
                    <FieldDescription>
                      The part after /s/ in the agent's open walk-in link.
                    </FieldDescription>
                  </Field>
                </>
              )}
            </div>
            <div className="gap-4 flex flex-col -mt-3">
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="scn-role">
                  {sceneDetail?.scenario_type === "SQOUTS" ? "Sqouts Role Description" : "Testee AI Role Description"}
                  <span className=" text-red-700">*</span>
                </FieldLabel>
                <Textarea
                  id="scn-role"
                  name="ai_role"
                  required
                  rows={8}
                  placeholder="Character: … Scenario: …"
                  className="field-sizing-fixed border-2"
                  defaultValue={sceneDetail?.ai_role}
                />
                <FieldDescription>
                  The Character and Situation exactly as {sceneDetail?.scenario_type === "SQOUTS" ? "entered in the Sqouts wizard" : "you have set up"}
                  . The judge scores the AI against this.
                </FieldDescription>
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="scn-desc">Description</FieldLabel>
                <Textarea
                  id="scn-desc"
                  name="description"
                  rows={4}
                  placeholder="What this scenario is for, for your teammates"
                  className="field-sizing-fixed border-2"
                  defaultValue={sceneDetail?.description}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {/* <div className="w-full justify-end flex">
                <Button type="submit" className="h-10" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? "Saving" : "Save Scenario"}
                </Button>
              </div> */}
            </div>
          </FieldGroup>
          {dirty && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-xl border-2 bg-background p-3 shadow-lg">
              <span className="text-sm">Unsaved changes</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={discard}>
                  Discard
                </Button>
                <Button type="submit" disabled={saving}>
                  Save Scenario
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>
      <div className="mt-8">
        <div className="flex justify-between">
          <h2 className="text-lg">Test cases</h2>
          <div className="flex gap-3">
            <Field className="">
              <Input
                id="search"
                name="search"
                required
                placeholder="Search test cases"
                onChange={(e) => setSearchVal(e.target.value)}
                className=" h-10 border-2"
              />
            </Field>
            <NewTestCaseDialog sceneId={sceneid!} type={sceneDetail?.scenario_type}/>
          </div>
        </div>
        <div className="mt-4">
          <TestCaseTable
            rows={testCases?.data ?? []}
            loading={tcLoading}
            query={query}
            onEdit={toTestCase}
          />
          <Pager
            className="mt-4"
            page={page}
            length={testCases?.pagin.total_page ?? 0}
            onChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
