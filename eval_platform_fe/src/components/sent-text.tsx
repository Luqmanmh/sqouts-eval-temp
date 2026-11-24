const MARKUP =
  /<emotion\s+value=["']([^"']+)["']\s*\/?>|<break\s+time=["']([^"']+)["']\s*\/?>|<spell>([\s\S]*?)<\/spell>|\[([^\]]+)\]|<[^>]+>/g;

type Part =
  | { kind: "text"; text: string }
  | { kind: "emotion"; text: string }
  | { kind: "break"; text: string }
  | { kind: "spell"; text: string };

function parse(line: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of line.matchAll(MARKUP)) {
    if (m.index > last) parts.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] ?? m[4]) parts.push({ kind: "emotion", text: (m[1] ?? m[4])! });
    else if (m[2]) parts.push({ kind: "break", text: m[2] });
    else if (m[3]) parts.push({ kind: "spell", text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ kind: "text", text: line.slice(last) });
  return parts;
}

const speakable = (parts: Part[]) =>
  parts.some((p) => (p.kind === "text" || p.kind === "spell") && /\p{L}|\p{N}/u.test(p.text));

/** The reply as the tester generated it, before TTS and Sqouts' speech-to-text.
 *  Emotion tags become chips, breaks show their length, spelled codes are monospace. */
export function SentText({ text }: { text: string }) {
  const lines: Part[][] = [];
  let carry: Part[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const parts = parse(raw);
    // console.log(parts)
    if (!speakable(parts)) {
      carry = [...carry, ...parts.filter((p) => p.kind !== "text")];
      continue;
    }
    lines.push([...carry, ...parts]);
    carry = [];
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-dashed bg-muted/40 p-3 text-sm">
      {lines.map((parts, i) => (
        <p key={i} className="leading-relaxed">
          {parts.map((p, j) => {
            switch (p.kind) {
              case "emotion":
                return (
                  <span
                    key={j}
                    className="mr-1 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {p.text}
                  </span>
                );
              case "break":
                return (
                  <span key={j} className="mx-1 font-mono text-[10px] text-muted-foreground">
                    ⏸ {p.text}
                  </span>
                );
              case "spell":
                return (
                  <>
                  <span className="mr-1 rounded bg-background pl-0.5 py-0.5 font-mono text-[10px] text-muted-foreground">spell:</span>
                    <span key={j} className="rounded bg-background font-mono tracking-wider">
                      {p.text}
                    </span>
                  </>
                );
              default:
                return <span key={j}>{p.text}</span>;
            }
          })}
        </p>
      ))}
    </div>
  );
}