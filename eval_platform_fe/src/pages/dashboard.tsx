// import { useLocation } from "react-router-dom";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { scenarios, type ScenarioListItem, type Paged } from "@/api";
import { ScenarioCard } from "@/components/scenario-card";
import { Pager } from "@/components/pager";
import { NewScenarioDialog } from "@/components/new-scenario-dialog";
import { Loader2 } from "lucide-react";

export function Dashboard() {
  // const loc = useLocation()
  const [scenarioList, setScenarioLIst] =
    useState<Paged<ScenarioListItem> | null>(null);
  const [searchVal, setSearchVal] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchVal);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchVal]);

  // Fetch whenever the search or page changes.
  useEffect(() => {
    let ignore = false; // stops an old, slow response overwriting a newer one

    async function load() {
      // setLoading(true);
      setError("");
      try {
        const res = await scenarios.list({ query, page });
        if (!ignore) {
          setScenarioLIst(res);
          // setPage(res.pagin.current_page);
        }
      } catch {
        if (!ignore) setError("Couldn't load scenarios.");
      }
      // finally {
      //   if (!ignore) setLoading(false);
      // }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [query, page]);

  return (
    <div>
      <h1 className=" text-3xl mb-4">Scenarios</h1>
      <div className="flex justify-between">
        <Field className="w-3/4">
          <Input
            id="search"
            name="search"
            required
            placeholder="Search for a scenario"
            onChange={(e) => setSearchVal(e.target.value)}
            className=" h-10 border-2"
          />
        </Field>
        <NewScenarioDialog />
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!scenarioList &&
        <div className="w-full mt-6">
          <Loader2 size={57} className="animate-spin text-primary mx-auto"/>
        </div>
      }
      <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {scenarioList?.data.map((s) => (
          <ScenarioCard key={s.id} scenario={s} />
        ))}
      </div>
      {scenarioList?.data && scenarioList?.data.length < 1 &&
      <div className="w-full text-center">
        You haven't created a scenario yet
      </div>
      }
      <Pager
        page={page}
        length={scenarioList?.pagin.total_page ?? 0}
        onChange={setPage}
        totalVisible={5}
      />
    </div>
  );
}
