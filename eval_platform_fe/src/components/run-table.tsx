import type { RunListItem } from "@/api";
import { Badge } from "./ui/badge";
import { ChevronRight, Loader2 } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { LastResult } from "./test-case-table";
import { useNavigate } from "react-router-dom";

dayjs.extend(relativeTime);

type RunTableProps = {
  rows: RunListItem[];
  loading?: boolean;
};

const COLS = 4;

function StatusBadge({ status }: { status: RunListItem["status"] }) {
  switch (status) {
    case "RUNNING":
      return (
        <Badge variant="secondary">
          <Loader2 className="animate-spin" /> Running
        </Badge>
      );
    case "PREPARING":
      return <Badge variant="secondary">Preparing</Badge>;
    case "ABORTED":
      return <Badge variant="destructive">Aborted</Badge>;
    default:
      return <Badge variant="outline">Done</Badge>;
  }
}

export function RunTable({ rows, loading }: RunTableProps) {
  const th = "px-4 py-3 text-left text-sm font-medium text-muted-foreground";
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto rounded-2xl border-2">
      <table className="w-full">
        <thead className="border-b-2 bg-secondary/50">
          <tr>
            <th className={th}>Run</th>
            <th className={th}>Status</th>
            <th className={th}>Result</th>
            <th className={th}>Finished</th>
            <th className={th}></th>
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
                No runs yet.
              </td>
            </tr>
          ) : (
            rows.map((run) => (
              <tr
                key={run.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
                onClick={() => navigate(`run/${run.id}`)}
              >
                <td className="px-4 py-3 font-mono text-sm" title={run.id}>
                  {run.id}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3">
                  {run.status === "DONE" ? (
                    <LastResult run={run} />
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {run.status === "DONE" && run.finish_time ? (
                    <span>
                      {dayjs(run.finish_time).format("D MMM YYYY, HH:mm")}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td onClick={() => navigate(`run/${run.id}`)}>
                  <div className="flex text-sm items-center cursor-pointer">
                    Open <ChevronRight className=" size-4"/>
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
