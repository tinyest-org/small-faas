import { Hono } from 'hono';
import { Fn, getParams, loadWasmFunction } from "./utils.ts";
import { Provider, S3Provider } from "./provider.ts";

const app = new Hono();

class Executor {

  private functions: Map<string, Fn> = new Map();
  private provider: Provider;

  private constructor(provider: Provider) {
    this.provider = provider;
  }

  // deno-lint-ignore require-await
  public static async new(provider: Provider) {
    const cache = new Executor(provider);
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
    const i = await this.provider.get(name);
    if (!i) {
      return;
    }
    const { name: nameToLoad, data } = i;
    if (data) {
      const f = await loadWasmFunction(nameToLoad, data);
      if (f) {
        this.functions.set(name, f);
        return f;
      }
    }
  }
}

// use S3 provider in prod
// const testProvider = new TestProvider();

const provider = new S3Provider(
  Deno.env.get("ENDPOINT")!,
  Deno.env.get("BUCKET")!,
  Deno.env.get("KEY")!,
  Deno.env.get("SECRET")!,
);

const executor = await Executor.new(provider);

app.delete("/", async c => {
  const params: string[] = await c.req.json();
  await Promise.all(params.map(executor.remove));
  return c.text("OK");
});

app.get("/", async c => {
  return c.json(await executor.keys());
});



app.post('/:funcName', async (c) => {
  const funcName = c.req.param('funcName');
  const fn = await executor.get(funcName);
  if (fn === undefined) {
    return c.notFound();
  }
  const form = await c.req.formData();
  const params = getParams(form);
  const spread = Array.isArray(params);
  let result;
  if (spread) {
    // @ts-ignore, hard to properly type this for now
    result = await fn(...params);
  } else {
    result = await fn(params);
  }
  return c.json(result);
});

Deno.serve(app.fetch)