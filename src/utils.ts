
export type Fn = (params: unknown) => Promise<any>
  | ((...params: unknown[]) => Promise<any>);



export async function loadWasmFunction(
    funcName: string,
    source: Uint8Array,
) {
    const module = await WebAssembly.compile(source);
    const instance = await WebAssembly.instantiate(module);
    const fn = instance.exports[funcName] as Fn;
    return fn;
}

export function getParams(form: FormData): unknown | undefined {
    const f = form.get("params");
    if (typeof f !== "string") {
      return undefined;
    }
    const params = JSON.parse(f);
    return params;
  }