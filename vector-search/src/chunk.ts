import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Chunk {
  id: number;
  path: string;   // путь относительно корня выгрузки
  kind: "bsl" | "xml";
  object: string; // имя объекта метаданных / модуля
  name: string;   // имя процедуры/функции или объекта
  line: number;   // строка начала (для BSL)
  text: string;
}

const SECTIONS = new Set([
  "AccumulationRegisters",
  "Catalogs",
  "ChartsOfCharacteristicTypes",
  "CommonModules",
  "DataProcessors",
  "DefinedTypes",
  "DocumentNumerators",
  "Documents",
  "Enums",
  "InformationRegisters",
  "Reports",
  "Roles",
  "Subsystems",
]);

// Рекурсивный обход каталога, возвращает пути файлов относительно корня.
async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = full.slice(base.length + 1);
    if (e.isDirectory()) {
      out.push(...(await walk(full, base)));
    } else if (e.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

export async function listFiles(root: string): Promise<string[]> {
  return walk(root, root);
}

// Разбор относительного пути -> имя объекта метаданных.
function objectNameFromPath(relPath: string): string {
  const parts = relPath.split(/[\\/]/);
  for (let i = 0; i < parts.length; i++) {
    if (SECTIONS.has(parts[i])) {
      return parts[i + 1] ?? parts[i];
    }
  }
  return parts[parts.length - 1] ?? relPath;
}

// ---------------------------------------------------------------------------
// BSL: чанк = процедура/функция; отдельный чанк = шапка модуля (комментарии).
// ---------------------------------------------------------------------------
const PROC_RE = /^\s*(Процедура|Функция)\s+([А-Яа-яЁёA-Za-z0-9_]+)/;
const END_RE = /^\s*(КонецПроцедуры|КонецФункции)/;

export function chunkBsl(content: string, relPath: string, objectName: string): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split(/\r?\n/);

  let header: string[] = [];
  let current: { name: string; start: number; body: string[] } | null = null;

  const pushHeader = () => {
    const text = header.join("\n").trim();
    if (text) {
      chunks.push({ id: 0, path: relPath, kind: "bsl", object: objectName, name: objectName, line: 1, text });
    }
    header = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(PROC_RE);

    if (m && !current) {
      pushHeader();
      current = { name: m[2], start: i + 1, body: [line] };
      continue;
    }

    if (current) {
      current.body.push(line);
      if (END_RE.test(line)) {
        chunks.push({
          id: 0,
          path: relPath,
          kind: "bsl",
          object: objectName,
          name: current.name,
          line: current.start,
          text: current.body.join("\n"),
        });
        current = null;
      }
      continue;
    }

    const t = line.trim();
    if (t === "" || t.startsWith("//") || t.startsWith("#Область") || t.startsWith("#КонецОбласти")) {
      header.push(line);
    }
  }
  pushHeader();

  return chunks;
}

// ---------------------------------------------------------------------------
// XML: извлекаем смысловое содержимое (имена, синонимы, комментарии, состав).
// ---------------------------------------------------------------------------
const CHILD_RE =
  /<(Catalog|Document|Report|InformationRegister|AccumulationRegister|CommonModule|Enum|Subsystem|Role|DataProcessor|ChartOfCharacteristicTypes|DocumentNumerator|Resource|Dimension|Attribute|TabularSection|Form|Command|DefinedType|Language)>([^<]+)<\/\1>/g;

export function extractXmlMeta(content: string): string {
  const parts: string[] = [];

  const names = new Set([...content.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]));
  const synonyms = new Set([...content.matchAll(/<v8:content>([^<]+)<\/v8:content>/g)].map((m) => m[1]));
  const comments = [...content.matchAll(/<Comment>([^<]*)<\/Comment>/g)].map((m) => m[1]).filter(Boolean);

  if (names.size) parts.push("Имя: " + [...names].join(", "));
  if (synonyms.size) parts.push("Синоним: " + [...synonyms].join("; "));
  if (comments.length) parts.push("Комментарий: " + [...comments].join("; "));

  const childObj = new Set<string>();
  for (const m of content.matchAll(CHILD_RE)) {
    childObj.add(m[1] + " " + m[2]);
  }
  if (childObj.size) parts.push("Состав: " + [...childObj].join(", "));

  return parts.join("\n");
}

// Файл XML считается «метаданными объекта», если лежит на глубине 1 (Configuration.xml)
// или 2 (Секция/Объект.xml). Вложенные Form.xml/Template.xml пропускаем.
function isMetaXml(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/);
  if (parts.length === 1) return parts[0] === "Configuration.xml";
  if (parts.length === 2) return parts[1] !== "ConfigDumpInfo.xml" && parts[1].endsWith(".xml");
  return false;
}

export async function collectChunks(root: string): Promise<Chunk[]> {
  const files = await listFiles(root);
  const chunks: Chunk[] = [];

  for (const rel of files) {
    const full = join(root, rel);
    const objectName = objectNameFromPath(rel);

    if (rel.endsWith(".bsl")) {
      const content = await readFile(full, "utf8");
      chunks.push(...chunkBsl(content, rel, objectName));
    } else if (rel.endsWith(".xml") && isMetaXml(rel)) {
      const content = await readFile(full, "utf8");
      const meta = extractXmlMeta(content);
      if (meta) {
        chunks.push({ id: 0, path: rel, kind: "xml", object: objectName, name: objectName, line: 0, text: meta });
      }
    }
  }

  chunks.forEach((c, i) => (c.id = i));
  return chunks;
}
