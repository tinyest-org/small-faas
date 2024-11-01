FROM denoland/deno:alpine-2.0.4

WORKDIR /app

COPY deno.json .
COPY deno.lock .
COPY src/main.ts src/main.ts
COPY src/utils.ts src/utils.ts

RUN deno install --entrypoint src/main.ts

RUN ls

CMD ["deno", "run", "--allow-env", "--allow-read", "--allow-net", "--env-file", "src/main.ts"]