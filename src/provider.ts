import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts";

export interface Provider {
    get(name: string): Promise<{ data: Uint8Array, name: string } | undefined>;
}

export type Manifest = {
    path: string;
    funcName: string;
}


export class TestProvider implements Provider {
    async get(_: string): Promise<{ data: Uint8Array, name: string } | undefined> {
        const _manifest = await Deno.readTextFile("tests/manifest.json");
        const d = await Deno.readFile("tests/incrementer.wasm");
        return {
            name: "increment",
            data: d,
        };
    }
}


export class S3Provider implements Provider {
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