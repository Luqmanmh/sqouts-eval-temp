import type { EvalRes } from "@/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** One row per scored metric: name, score out of 5, and the judge's evidence. */
export function MetricResult({
  evalRes,
  passThreshold,
}: {
  evalRes: EvalRes;
  passThreshold: number;
}) {
  // Older result files have no `metrics` list, so fall back to the bare keys.
  const rows =
    evalRes.metrics ??
    Object.keys(evalRes.metric_scores).map((key) => ({
      id: key,
      key,
      name: key,
      description: "",
      critical: false,
    }));

  return (
    <div className="flex flex-col divide-y">
      {rows.map((m) => {
        const score = evalRes.metric_scores[m.key];
        const below = score < passThreshold;
        return (
          <div key={m.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {m.name}{" "}
                  {m.critical && <Badge variant="destructive">Critical</Badge>}
                </p>
                {m.description && (
                  <p className="text-sm text-muted-foreground">
                    {m.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-end">
                <span
                  className={cn(
                    "text-2xl font-bold",
                    score === undefined
                      ? "text-muted-foreground"
                      : below
                        ? m.critical
                          ? "text-destructive"
                          : "text-amber-600"
                        : "text-emerald-700",
                  )}
                >
                  {score ?? "-"}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </div>
            </div>
            {/* 5 segments, filled up to the score */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    n <= (score ?? 0)
                      ? below
                        ? m.critical
                          ? "bg-destructive"
                          : "bg-amber-500"
                        : "bg-emerald-600"
                      : "bg-muted",
                  )}
                />
              ))}
            </div>
            {evalRes.metric_evidence[m.key] && (
              <p className="rounded-xl bg-muted p-3 text-sm">
                {evalRes.metric_evidence[m.key]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
