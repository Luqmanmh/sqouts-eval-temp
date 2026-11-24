import { call, type TestCaseListItem } from "@/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ChevronRight, Loader2, Play } from "lucide-react";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useState } from "react";

dayjs.extend(relativeTime);

type TestCaseTableProps = {
  rows: TestCaseListItem[];
  loading?: boolean;
  query?: string;
  /** Row actions. A button only renders when its handler is passed, so the
   *  column fills in as the run and edit endpoints land. */
  // onRun?: (tc: TestCaseListItem["id"]) => void;
  onEdit?: (tc: TestCaseListItem["id"]) => void;
};

const COLS = 5;

export function LastResult({
  run,
}: {
  run: Pick<
    NonNullable<TestCaseListItem["last_run"]>,
    "passed" | "overall_score"
  > | null;
}) {
  if (!run)
    return <span className="text-sm text-muted-foreground">No runs yet</span>;
  if (run.passed === null)
    return <span className="text-sm text-muted-foreground">No verdict</span>;

  return (
    <div className="flex items-center gap-2">
      {run.passed ? (
        <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
          Pass
        </Badge>
      ) : (
        <Badge variant="destructive">Fail</Badge>
      )}
      {run.overall_score !== null && (
        <span className="text-sm tabular-nums text-gray-600">
          {run.overall_score.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export function TestCaseTable({
  rows,
  loading,
  query,
  onEdit,
}: TestCaseTableProps) {
  const th = "px-4 py-3 text-left text-sm font-medium text-muted-foreground";
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    console.log(error);
  }, [error]);

  async function handleStartRun(tcid: number) {
    setStarting(true);
    setError("");
    try {
      await call.startcall(Number(tcid), 1);
    } catch {
      setError("Couldn't start the runs.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border-2">
      <table className="w-full">
        <thead className="border-b-2 bg-secondary/50">
          <tr>
            <th className={th}>Test case</th>
            <th className={th}>Language</th>
            <th className={th}>Last result</th>
            <th className={th}>Last run</th>
            <th className={`${th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr>
              <td
                colSpan={COLS}
                className="px-4 py-10 text-center text-sm text-muted-foreground"
              >
                <Loader2 className="mx-auto size-5 animate-spin" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={COLS}
                className="px-4 py-10 text-center text-sm text-muted-foreground"
              >
                {query
                  ? `No test cases match "${query}".`
                  : "No test cases yet."}
              </td>
            </tr>
          ) : (
            rows.map((tc) => (
              <tr
                key={tc.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
              >
                <td className="max-w-md px-4 py-3">
                  {/* relative: the table lives on /scenarios/:sceneid */}
                  <Link
                    to={"testcases/" + String(tc.id)}
                    className="line-clamp-2 text-sm font-medium hover:underline"
                    title={tc.name}
                  >
                    {tc.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="font-mono uppercase">
                    {tc.language}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <LastResult run={tc.last_run} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {tc.last_run ? (
                    <span
                      title={dayjs(tc.last_run.finished_at).format(
                        "D MMM YYYY, HH:mm",
                      )}
                    >
                      {dayjs(tc.last_run.finished_at).fromNow()}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-4">
                    {tc.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartRun(tc.id)}
                        disabled={starting}
                      >
                        {starting ? (
                          <span className="flex items-center gap-1">
                            <Loader2 /> Starting
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Play /> Run
                          </span>
                        )}
                      </Button>
                    )}
                    {onEdit && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Edit test case"
                        onClick={() => onEdit(tc.id)}
                      >
                        open <ChevronRight/>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
