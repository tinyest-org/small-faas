import { Hono } from 'hono';

const app = new Hono();

type Fn = (params: any) => Promise<any>
  | ((...params: any[]) => Promise<any>);


async function loadWasmFunction(
  funcName: string,
  source: Uint8Array,
) {
  const module = await WebAssembly.compile(source);
  const instance = await WebAssembly.instantiate(module);
  const fn = instance.exports[funcName] as Fn;
  return fn;
}

interface Provider {
  get(name: string): Promise<Uint8Array | undefined>;
}

// TODO: implement the real S3 provider or http provider

class TestProvider implements Provider {
  async get(name: string): Promise<Uint8Array | undefined> {
    const d = await Deno.readFile("incrementer.wasm");
    return d;
  }
}


class Cache {

  private functions: Map<string, Fn> = new Map();
  private provider: Provider;

  private constructor(provider: Provider) {
    this.provider = provider;
  }

  // deno-lint-ignore require-await
  public static async new(provider: Provider) {
    const cache = new Cache(provider);
    return cache;
  }

  /**
   * Function to invalidate a loaded value
   * @param name name of the function to delete
   */
  // deno-lint-ignore require-await
  async remove(name: string) {
    this.functions.delete(name);
  }
  // deno-lint-ignore require-await
  async keys() {
    return [...this.functions.keys()];
  }

  async get(name: string) {
    const fn = this.functions.get(name);
    if (fn) {
      return fn;
    }
    const data = await this.provider.get(name);
    if (data) {
      const f = await loadWasmFunction(name, data);
      if (f) {
        this.functions.set(name, f);
        return f;
      }
    }
  }
}
const testProvider = new TestProvider();
const cache = await Cache.new(testProvider);

app.delete("/", async c => {
  const params: string[] = await c.req.json();
  await Promise.all(params.map(cache.remove));
  return c.text("OK");
});

app.get("/", async c => {
  return c.json(await cache.keys());
});

app.post('/:funcName', async (c) => {
  const funcName = c.req.param('funcName');
  const fn = await cache.get(funcName);
  if (fn === undefined) {
    return c.notFound();
  }
  const form = await c.req.formData();
  const params = JSON.parse(form.get("params")!);
  const spread = Array.isArray(params);
  console.log(params);
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