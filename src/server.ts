import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import Elysia, { file, HTTPMethod, t } from "elysia";
import fs from "fs/promises";
import findPort from "./lib/find-port";
import { nanoid } from "nanoid";
import { resolve } from "path";

const corsConfig = {
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT"] as HTTPMethod[],
  allowedHeaders: "*",
  exposedHeaders: "*",
  maxAge: 5,
  credentials: true,
};

const uploadsDir = "/tmp/wibu-bot/uploads";

fs.mkdir(uploadsDir, { recursive: true }).catch((error) => {
  console.error(error);
});

const app = new Elysia()
  .use(swagger({ path: "/api/docs" }))
  .use(cors(corsConfig))
  .get("/", ({ set }) => {
    set.headers = {
      "content-type": "text/html",
    };
    return "wibu-bot gaes";
  })
  .group("/api", (app) =>
    app
      .get("/logs/staging/out/:project", async ({ params, request }) => {
        const { project } = params;
        try {
          await fs.access(`/tmp/wibu-bot/logs/build-${project}-out.log`);
          return file(`/tmp/wibu-bot/logs/build-${project}-out.log`);
        } catch (error) {
          console.error(error);
          return "[ERROR] File tidak ditemukan";
        }
      })
      .get("/logs/staging/err/:project", async ({ params, request }) => {
        const { project } = params;
        try {
          await fs.access(`/tmp/wibu-bot/logs/build-${project}-err.log`);
          return file(`/tmp/wibu-bot/logs/build-${project}-err.log`);
        } catch (error) {
          console.error(error);
          return "[ERROR] File tidak ditemukan";
        }
      })
      .get("/find-port/:count?", async ({ params, request }) => {
        const { count } = params;
        const port = await findPort({ count: count ? parseInt(count) : 1 });
        return port;
      })
      .post(
        "/file",
        async ({ request, body }) => {
          const hostname = new URL(request.url).origin;
          const { file } = body;
          const name = nanoid(10);

          // Pastikan folder `uploadsDir` ada
          await fs.mkdir(uploadsDir, { recursive: true });

          // Simpan file secara benar
          const filePath = resolve(uploadsDir, `${name}-${file.name}`);
          const buffer = Buffer.from(await file.arrayBuffer());
          await fs.writeFile(filePath, buffer);

          // Kembalikan URL lengkap untuk diakses
          return `${hostname}/api/file/${name}-${file.name}`;
        },
        {
          body: t.Object({
            file: t.File(), // Menggunakan file upload yang benar
          }),
        }
      )
      // Menyediakan akses statis ke folder uploads
      .get("/file/*", async ({ params }) => {
        return Bun.file(resolve(uploadsDir, params["*"]));
      })
  );

function start() {
  if (!Bun.env.WIBU_PORT) {
    console.error("[ERROR] WIBU_PORT is not defined");
    process.exit(1);
  }
  app.listen(Bun.env.WIBU_PORT, () => {
    console.log(`[SERVER] started on port ${Bun.env.WIBU_PORT}`);
  });
}

const server = {
  app,
  start,
};

export default server;
