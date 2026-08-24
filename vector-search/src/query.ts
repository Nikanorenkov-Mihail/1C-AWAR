import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedTexts, cosine } from "./embed.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX_FILE = join(ROOT, "index.json");

interface IndexChunk {
  id: number;
  path: string;
  kind: "bsl" | "xml";
  object: string;
  name: string;
  line: number;
  text: string;
  vec: number[];
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error("Укажите запрос: npm run query \"как рассчитывается чистый вес\"");
    process.exit(1);
  }

  const index = JSON.parse(await readFile(INDEX_FILE, "utf8"));
  const chunks: IndexChunk[] = index.chunks;

  console.log(`Модель: ${index.model}, чанков: ${chunks.length}\n`);
  console.log(`Запрос: ${query}\n`);

  const [qv] = await embedTexts([query], index.model);

  const scored = chunks
    .map((c) => ({ c, score: cosine(qv, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const { c, score } of scored) {
    const where = c.line ? `${c.path}:${c.line}` : c.path;
    console.log(`[${score.toFixed(3)}] ${c.kind === "bsl" ? c.name : c.object}  (${where})`);
    const snippet = c.text.replace(/\s+/g, " ").trim().slice(0, 220);
    console.log(`    ${snippet}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
