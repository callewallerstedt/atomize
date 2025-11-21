export function ensureClosedMarkdownFences(md: string): string {
  if (!md) return "";

  const lines = md.split("\n");
  let inFence = false;
  let fenceChar: "`" | "~" | null = null;
  let fenceLength = 0;

  const fenceRegex = /^(\s*)(`{3,}|~{3,})/;

  for (const line of lines) {
    const match = line.match(fenceRegex);
    if (!match) continue;

    const marker = match[2];
    const char = marker[0] as "`" | "~";

    if (!inFence) {
      inFence = true;
      fenceChar = char;
      fenceLength = marker.length;
    } else if (fenceChar === char && marker.length >= fenceLength) {
      inFence = false;
      fenceChar = null;
      fenceLength = 0;
    }
  }

  if (inFence) {
    const closingChar = fenceChar ?? "`";
    const closingLength = fenceLength || 3;
    return `${md}\n${closingChar.repeat(closingLength)}`;
  }

  return md;
}



