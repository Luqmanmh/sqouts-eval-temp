import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PagerProps = {
  /** current page, 1-based */
  page: number;
  /** total number of pages (e.g. pagin.total_page) */
  length: number;
  onChange: (page: number) => void;
  /** how many page numbers to show at most, first and last included */
  totalVisible?: number;
  className?: string;
};

/** The page numbers to render, with "…" where a run of pages is skipped:
 *  page 6 of 20 with 5 visible → 1 … 5 6 7 … 20 */
function pagesToShow(
  page: number,
  length: number,
  totalVisible: number,
): (number | "…")[] {
  if (length <= totalVisible) return Array.from({ length }, (_, i) => i + 1);

  const inner = Math.max(totalVisible - 2, 1); // slots between the first and last page
  let start = Math.max(2, page - Math.floor((inner - 1) / 2));
  const end = Math.min(length - 1, start + inner - 1);
  start = Math.max(2, end - inner + 1); // near the end, slide the window back

  const out: (number | "…")[] = [1];
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < length - 1) out.push("…");
  out.push(length);
  return out;
}

/** Page switcher in the spirit of Vuetify's <v-pagination>:
 *  <Pager page={page} length={total} onChange={setPage} totalVisible={5} /> */
export function Pager({
  page,
  length,
  onChange,
  totalVisible = 5,
  className,
}: PagerProps) {
  if (length <= 1) return null;

  const go = (p: number) => {
    if (p >= 1 && p <= length && p !== page) onChange(p);
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>

      {pagesToShow(page, length, totalVisible).map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-2 text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "ghost"}
            size="icon"
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => go(p)}
          >
            {p}
          </Button>
        ),
      )}

      <Button
        variant="ghost"
        size="icon"
        aria-label="Next page"
        disabled={page >= length}
        onClick={() => go(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
