declare module "bun" {
    interface Env {
        WIBU_BOT_TOKEN: string | undefined;
        WIBU_PORT: string | undefined;
        WIBU_URL: string | undefined;
        WIBU_LOGS_DIR: string | undefined;
    }
}