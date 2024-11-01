import { Hono } from 'hono';
import { Fn, loadWasmFunction } from "./utils.ts";
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts";

const app = new Hono();

type Manifest = {
  path: string;
  funcName: string;
}

interface Provider {
  get(name: string): Promise<{ data: Uint8Array, name: string } | undefined>;
}

// TODO: implement the real S3 provider or http provider

class TestProvider implements Provider {
  async get(_: string): Promise<{ data: Uint8Array, name: string } | undefined> {
    const manifest = await Deno.readTextFile("tests/manifest.json");
    const d = await Deno.readFile("tests/incrementer.wasm");
    return {
      name: "increment",
      data: d,
    };
  }
}

class S3Provider implements Provider {
  private client: S3Client;
  constructor(endpoint: string, bucket: string, id: string, secret: string) {
    const client = new S3Client({
      endPoint: endpoint,
      port: 443,
      useSSL: true,
      region: "us-east-1",
      bucket,
      pathStyle: true,
      accessKey: id,
      secretKey: secret,
    });
    this.client = client;
  }
  async get(name: string): Promise<{ data: Uint8Array, name: string } | undefined> {
    const reqManifest = await this.client.getObject(`${name}.json`);
    const manifest: Manifest = await reqManifest.json();
    const req = await this.client.getObject(manifest.path);
    const content = await req.bytes();
    return {
      data: content,
      name: manifest.funcName,
    };
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

const cache = await Cache.new(provider);

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