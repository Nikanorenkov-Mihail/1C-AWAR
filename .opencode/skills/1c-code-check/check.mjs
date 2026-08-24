#!/usr/bin/env node
// Проверка синтаксиса BSL: баланс блоков (Процедура/Если/Цикл/Попытка/Выбор/Область).
// Использование: node check.mjs [файл.bsl | каталог]

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const OPENERS = new Set([
  "Процедура", "Функция", "Если", "Для", "Пока", "Попытка", "Выбор", "#Область",
]);

const CLOSERS = {
  "КонецПроцедуры": ["Процедура"],
  "КонецФункции": ["Функция"],
  "КонецЕсли": ["Если"],
  "КонецЦикла": ["Для", "Пока"],
  "КонецПопытки": ["Попытка"],
  "КонецВыбора": ["Выбор"],
  "#КонецОбласти": ["#Область"],
};

const WORD = "[А-Яа-яЁёA-Za-z0-9_]";
const KEYWORDS = [
  "Процедура", "Функция", "КонецПроцедуры", "КонецФункции",
  "ИначеЕсли", "Если", "Иначе", "КонецЕсли",
  "Для", "Пока", "Цикл", "КонецЦикла",
  "Попытка", "Исключение", "КонецПопытки",
  "Выбор", "КонецВыбора",
  "#КонецОбласти", "#Область",
];
const TOKEN_RE = new RegExp(
  "(?<!" + WORD + ")(?:" + KEYWORDS.join("|") + ")(?!" + WORD + ")",
  "g"
);

// Убирает строки ("...") и комментарии (//), сохраняя номера строк.
function sanitize(content) {
  return content.split(/\r?\n/).map((line) => {
    let s = "";
    let i = 0;
    let inString = false;
    while (i < line.length) {
      const ch = line[i];
      if (inString) {
        if (ch === '"') {
          if (line[i + 1] === '"') { s += "  "; i += 2; continue; }
          inString = false; s += " "; i += 1; continue;
        }
        s += " "; i += 1; continue;
      }
      if (ch === '"') { inString = true; s += " "; i += 1; continue; }
      if (ch === "/" && line[i + 1] === "/") break;
      s += ch; i += 1;
    }
    return s;
  });
}

function check(content) {
  const lines = sanitize(content);
  const tokens = [];
  for (let li = 0; li < lines.length; li++) {
    const re = new RegExp(TOKEN_RE.source, "g");
    let m;
    while ((m = re.exec(lines[li])) !== null) {
      tokens.push({ word: m[0], line: li + 1 });
    }
  }

  const errors = [];
  const stack = []; // {opener, line}

  for (const t of tokens) {
    const w = t.word;
    if (OPENERS.has(w)) {
      stack.push({ opener: w, line: t.line });
      continue;
    }
    const expected = CLOSERS[w];
    if (!expected) continue; // Цикл / Иначе / ИначеЕсли / Исключение — не граница блока

    const top = stack.pop();
    if (!top) {
      errors.push(`строка ${t.line}: «${w}» без соответствующего открывающего блока`);
      continue;
    }
    if (!expected.includes(top.opener)) {
      errors.push(
        `строка ${t.line}: «${w}» не соответствует открытому «${top.opener}» (строка ${top.line})`
      );
    }
  }

  for (const left of stack) {
    errors.push(`строка ${left.line}: блок «${left.opener}» не закрыт`);
  }

  return errors;
}

async function listBsl(target) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".bsl")) files.push(full);
    }
  }
  await walk(target);
  return files;
}

async function main() {
  const target = resolve(process.argv[2] ?? join(process.cwd(), "20260824", "20260824"));
  const files = (target.endsWith(".bsl"))
    ? [target]
    : await listBsl(target);

  let total = 0;
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const errors = check(content);
    for (const e of errors) {
      console.log(`${file}:${e}`);
      total++;
    }
  }

  console.log(`Проверено файлов: ${files.length}, ошибок: ${total}`);
  if (total > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
