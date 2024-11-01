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