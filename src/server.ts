import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import Elysia, { file, HTTPMethod } from "elysia";
import fs from 'fs/promises';
import findPort from "./lib/find-port";

const corsConfig = {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"] as HTTPMethod[],
    allowedHeaders: "*",
    exposedHeaders: "*",
    maxAge: 5,
    credentials: true,
};

const app = new Elysia()
    .use(swagger({ path: "/api/docs" }))
    .use(cors(corsConfig))
    .get("/", ({ set }) => {
        set.headers = {
            "content-type": "text/html",
        }
        return "ya "
    })
    .group("/api", (app) => app
        .get('/logs/staging/out/:project', async ({ params, request }) => {
            const { project } = params
            try {
                await fs.access(`/tmp/wibu-bot/logs/build-${project}-out.log`)
                return file(`/tmp/wibu-bot/logs/build-${project}-out.log`)
            } catch (error) {
                console.error(error)
                return '[ERROR] File tidak ditemukan'
            }
        })
        .get('/logs/staging/err/:project', async ({ params, request }) => {
            const { project } = params
            try {
                await fs.access(`/tmp/wibu-bot/logs/build-${project}-err.log`)
                return file(`/tmp/wibu-bot/logs/build-${project}-err.log`)
            } catch (error) {
                console.error(error)
                return '[ERROR] File tidak ditemukan'
            }
        })
        .get('/find-port/:count?', async ({ params, request }) => {
            const { count } = params
            const port = await findPort({ count: count ? parseInt(count) : 1 })
            return port
        })
    )

function start() {
    if (!Bun.env.WIBU_PORT) {
        console.error('[ERROR] WIBU_PORT is not defined');
        process.exit(1);
    }
    app.listen(Bun.env.WIBU_PORT, () => {
        console.log(`[SERVER] started on port ${Bun.env.WIBU_PORT}`);
    });
}

const server = {
    app,
    start
}

export default server