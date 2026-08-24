import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectChunks } from "./chunk.js";
import { embedTexts, DEFAULT_MODEL } from "./embed.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DUMP = resolve(ROOT, "..", "20260824", "20260824");
const INDEX_FILE = join(ROOT, "index.json");

async function main() {
  console.log(`Выгрузка: ${DUMP}`);
  console.log("Чтение и разбиение на чанки...");
  const chunks = await collectChunks(DUMP);
  console.log(`Чанков: ${chunks.length}`);

  console.log(`Эмбеддинги (модель ${DEFAULT_MODEL})...`);
  const texts = chunks.map((c) => `${c.name}\n${c.text}`.slice(0, 2000));
  const vectors = await embedTexts(texts);

  const index = {
    model: DEFAULT_MODEL,
    created: new Date().toISOString(),
    chunks: chunks.map((c, i) => ({ ...c, vec: vectors[i] })),
  };

  await mkdir(ROOT, { recursive: true });
  await writeFile(INDEX_FILE, JSON.stringify(index));
  console.log(`Индекс сохранён: ${INDEX_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
