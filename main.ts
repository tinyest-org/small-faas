import { Hono } from 'hono';

const app = new Hono();

type Fn = (params: any) => Promise<any>
  | ((...params: any[]) => Promise<any>);


async function loadWasmFunction(
  fullName: string,
  funcName: string,
  source: Uint8Array,
) {
  const module = await WebAssembly.compile(source);
  const instance = await WebAssembly.instantiate(module);
  const fn = instance.exports[funcName] as Fn;
  return fn;
}

class Cache {

  private functions: Map<string, Fn> = new Map();

  private constructor() {

  }

  public static async new() {
    const cache = new Cache();
    const d = await Deno.readFile("incrementer.wasm");
    const fn = await loadWasmFunction("", "increment", d);
    cache.functions.set("increment", fn);
    return cache;
  }

  get(name: string) {
    return this.functions.get(name);
  }
}

const cache = await Cache.new();

app.post('/:funcName', async (c) => {
  const funcName = c.req.param('funcName');

  const fn = cache.get(funcName);
  if (fn === undefined) {
    return c.notFound();
  }
  const form = await c.req.formData();
  const params = JSON.parse(form.get("params")!);
  const spread = Array.isArray(params);
  let result;
  if (spread) {
    // @ts-ignore
    result = await fn(...params);
  } else {
    result = await fn(params);
  }

  return c.json(result);
});

Deno.serve(app.fetch)