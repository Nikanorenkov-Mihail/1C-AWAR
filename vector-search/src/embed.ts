import { pipeline } from "@huggingface/transformers";

export const DEFAULT_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let extractor: any = null;
let loadedModel = "";

async function getExtractor(model: string): Promise<any> {
  if (extractor && loadedModel === model) return extractor;
  extractor = await pipeline("feature-extraction", model);
  loadedModel = model;
  return extractor;
}

function meanPoolNormalize(seq: number[][]): number[] {
  const dim = seq[0].length;
  const v = new Array<number>(dim).fill(0);
  for (const row of seq) {
    for (let j = 0; j < dim; j++) v[j] += row[j];
  }
  for (let j = 0; j < dim; j++) v[j] /= seq.length;

  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let j = 0; j < dim; j++) v[j] /= norm;

  return v;
}

// Возвращает по одному L2-нормализованному вектору на каждый текст.
export async function embedTexts(texts: string[], model = DEFAULT_MODEL): Promise<number[][]> {
  const fn = await getExtractor(model);
  const result: number[][] = [];
  const BATCH = 32;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const tensor = await fn(batch);
    const list: any = tensor.tolist(); // [batch, seq, dim]
    for (const seq of list) {
      result.push(meanPoolNormalize(seq as number[][]));
    }
  }
  return result;
}

// Косинусное сходство двух L2-нормализованных векторов = скалярное произведение.
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
