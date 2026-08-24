#!/usr/bin/env node
// Граф зависимостей расширения 1С: документы -> регистры -> справочники.
// Читает XML-выгрузку конфигурации и выводит зависимости объектов.
// Использование: node graph.mjs [путь_к_выгрузке]

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const SECTIONS = {
  Documents: "Документ",
  Catalogs: "Справочник",
  AccumulationRegisters: "РегистрНакопления",
  InformationRegisters: "РегистрСведений",
  Enums: "Перечисление",
  ChartsOfCharacteristicTypes: "ПВХ",
};

const REF_TYPES = {
  CatalogRef: "Справочник",
  DocumentRef: "Документ",
  EnumRef: "Перечисление",
  ChartOfCharacteristicTypesRef: "ПВХ",
};

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".xml")).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// Извлекает из XML объекта: имя регистров-движений и ссылки на типы.
function parseObject(xml) {
  const registers = new Set();
  const refs = new Map(); // targetName -> refTypeLabel

  const rr = xml.match(/<RegisterRecords>([\s\S]*?)<\/RegisterRecords>/);
  if (rr) {
    for (const m of rr[1].matchAll(/(?:AccumulationRegister|InformationRegister)\.([^<\s]+)/g)) {
      registers.add(m[1]);
    }
  }

  for (const m of xml.matchAll(/cfg:(\w+)\.([^<]+)<\/v8:Type>/g)) {
    const label = REF_TYPES[m[1]];
    const to = m[2].trim();
    if (label && to) refs.set(to, label);
  }

  return { registers, refs };
}

function main() {
  const dump = resolve(process.argv[2] ?? join(process.cwd(), "20260824", "20260824"));

  const nodes = new Map(); // name -> type (rus)
  const edges = new Map(); // "from|to|rel" -> {from,to,rel}

  const addEdge = (from, to, rel) => {
    if (!to || to === from) return;
    edges.set(`${from}|${to}|${rel}`, { from, to, rel });
  };

  Promise.all(
    Object.entries(SECTIONS).map(async ([section, type]) => {
      const files = await listFiles(join(dump, section));
      for (const file of files) {
        const xml = await readFile(file, "utf8");
        const name = file.split(/[\\/]/).pop().slice(0, -4);
        nodes.set(name, type);
        const { registers, refs } = parseObject(xml);
        for (const r of registers) addEdge(name, r, "пишет в");
        for (const [to, rel] of refs) addEdge(name, to, `ссылается (${rel})`);
      }
    })
  ).then(() => render(nodes, edges));
}

function render(nodes, edges) {
  // Доопределяем типы для узлов, которые только упоминаются в рёбрах.
  const allNames = new Set(nodes.keys());
  const edgeList = [...edges.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
  );
  for (const e of edgeList) {
    allNames.add(e.from);
    allNames.add(e.to);
  }
  for (const name of allNames) {
    if (!nodes.has(name)) nodes.set(name, "?");
  }

  const byType = new Map();
  for (const [name, type] of nodes) {
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(name);
  }

  console.log("=== СВОДКА ===");
  for (const [type, list] of [...byType.entries()].sort()) {
    console.log(`${type}: ${list.length}`);
  }
  console.log(`\nРёбер: ${edgeList.length}\n`);

  console.log("=== ГРАФ (текст) ===");
  const printed = new Set();
  for (const e of edgeList) {
    const key = `${e.from} -> ${e.to}`;
    if (printed.has(key)) continue;
    printed.add(key);
    console.log(`${e.from}  ->  ${e.to}   [${e.rel}]`);
  }

  console.log("\n=== MERMAID ===");
  console.log("```mermaid");
  console.log("flowchart LR");
  const id = new Map();
  let n = 0;
  for (const name of allNames) id.set(name, "n" + n++);

  const subgraphId = (t) =>
    ({ Документ: "Документы", Справочник: "Справочники", РегистрНакопления: "РегистрыНакопления", РегистрСведений: "РегистрыСведений", Перечисление: "Перечисления", ПВХ: "ПВХ", "?": "Прочее" }[t] ?? t);

  const subgraphs = new Map();
  for (const [name, type] of nodes) {
    const sg = subgraphId(type);
    if (!subgraphs.has(sg)) subgraphs.set(sg, []);
    subgraphs.get(sg).push(name);
  }
  for (const [sg, list] of subgraphs) {
    console.log(`  subgraph ${sg}`);
    for (const name of list) {
      console.log(`    ${id.get(name)}["${name}"]`);
    }
    console.log("  end");
  }
  for (const e of edgeList) {
    const style = e.rel === "пишет в" ? " ==>|пишет в| " : " -->|" + e.rel + "| ";
    console.log(`  ${id.get(e.from)} ${style} ${id.get(e.to)}`);
  }
  console.log("```");
}

main();
