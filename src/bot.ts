import { spawn, Subprocess } from "bun";
import { formatDistanceToNow } from "date-fns";
import dedent from "dedent";
import fs from "fs/promises";
import { Bot, Context, InputFile } from "grammy";
import moment from "moment";
const appPackage = Bun.file('./package.json').json();

if (!Bun.env.WIBU_BOT_TOKEN || !Bun.env.WIBU_LOGS_DIR) {
    console.error('[ERROR] BOT_TOKEN or WIBU_LOGS_DIR is not defined');
    process.exit(1);
}

try {
    await fs.mkdir(Bun.env.WIBU_LOGS_DIR, { recursive: true })
} catch (error) {
    console.error(error)
    process.exit(1)
}

type EventMessage = {
    id: string;
    user: string;
    command: string;
    startedAt: string;
};


// Use a Map for efficient locking mechanism
const eventLock = new Map<string, EventMessage>();
type ParamsHandler = {
    ctx: Context
    id: string
    user: string
    command: string
    projectName: string | undefined
}

// Initialize Telegram bot
const bot = new Bot(Bun.env.WIBU_BOT_TOKEN);

const listMenu = [
    {
        "id": Bun.randomUUIDv7(),
        "cmd": "/start",
        "handler": start
    },
    {
        "id": Bun.randomUUIDv7(),
        "cmd": "/version",
        "handler": version
    },
    {
        "id": Bun.randomUUIDv7(),
        "cmd": "/buidStagingHipmi",
        "projectName": "hipmi",
        "handler": buildHipmiStaging
    },
    {
        "id": Bun.randomUUIDv7(),
        "cmd": "/buidStagingDarmasaba",
        "projectName": "darmasaba",
        "handler": buildDarmasabaStaging
    },
]

async function buildHipmiStaging(params: ParamsHandler) {
    build(params)
}

async function buildDarmasabaStaging(params: ParamsHandler) {
    build(params)
}

async function build(params: ParamsHandler) {
    const { ctx, id, user, command, projectName } = params

    // Check if the command is already running
    if (eventLock.has(id)) {
        const lockedEvent = eventLock.get(id)!;
        await ctx.reply(`Command ${command} sedang dijalankan oleh ${lockedEvent.user}, silakan coba lagi nanti.`);
        return;
    }

    // Add command to lock
    const event: EventMessage = {
        id,
        user,
        command,
        startedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
    };
    eventLock.set(id, event);

    try {
        await processBuild({ id, user, ctx, projectName })
    } catch (error) {
        console.error(error)
        await ctx.reply('[ERROR] Command tidak dikenali.');
    } finally {
        eventLock.delete(id);
    }
}

async function start({ ctx }: { ctx: Context }) {
    const menuText = listMenu.map((item) => `${item.cmd}`).join('\n')
    await ctx.reply(menuText)
}

async function version({ ctx }: { ctx: Context }) {
    const version = (await appPackage).version;
    const text = dedent`
        version: ${version}
    `;
    await ctx.reply(text);
}

// Handler for incoming messages
bot.on('message', async (ctx) => {
    const message = ctx.message.text;
    const user = ctx.message.from?.username || 'unknown';
    if (!message) return

    const cmd = listMenu.find((item) => item.cmd === message);
    if (!cmd) throw new Error('Command tidak dikenali.');
    await cmd.handler({ ctx, id: cmd.id, user, command: cmd.cmd, projectName: cmd.projectName });
});

async function processBuild({ id, user, ctx, projectName }: { id: string; user: string; ctx: Context; projectName: string | undefined; }) {
    if (!projectName) throw new Error('Project name is required');
    let buildTimer: NodeJS.Timeout | null = null;
    let count = 0
    const decodedText = new TextDecoder();
    let child: Subprocess<"ignore", "pipe", "inherit"> | null = null;
    const event = eventLock.get(id);
    if (!event) throw new Error('Event not found');
    buildTimer = setInterval(async () => {
        count++
        if (count > 15) {
            clearInterval(buildTimer as NodeJS.Timeout);
            ctx.reply(`[ERROR] processing selesai karena timeout , BUILD GAGAL`);
            child?.kill();
        }
    }, 1000 * 60) as NodeJS.Timeout;

    const logPath = `/tmp/wibu-bot/logs/build-${projectName}-out.log`
    const errorPath = `/tmp/wibu-bot/logs/build-${projectName}-err.log`
    await fs.writeFile(logPath, '');
    await fs.writeFile(errorPath, '');

    // Validasi nama proyek
    const safeProjectName = /^[a-zA-Z0-9_-]+$/.test(projectName)
        ? projectName
        : null;

    if (!safeProjectName) {
        await ctx.reply(`[ERROR] Nama proyek tidak valid. ${projectName}`);
        eventLock.delete(id); // Pastikan lock dihapus
        return;
    }

    try {
        await ctx.reply(`[INFO] Memulai build ${projectName}...`);
        child = spawn(["/bin/bash", 'build.sh'], {
            cwd: `/root/projects/staging/${safeProjectName}/scripts`
        })

        ctx.reply(`[INFO] log: ${Bun.env.WIBU_URL}/api/logs/staging/out/${projectName}`);
        ctx.reply(`[INFO] log: ${Bun.env.WIBU_URL}/api/logs/staging/err/${projectName}`);

        ctx.reply(`[INFO] Build ${projectName} sedang dijalankan oleh @${user}, silakan tunggu selesai...`);
        for await (const chunk of child.stdout) {
            const decodedChunk = decodedText.decode(chunk);
            await fs.appendFile(logPath, decodedChunk);
        }

        await fs.writeFile(logPath, '');
        for await (const chunk of child.stderr || []) {
            const decodedChunk = decodedText.decode(chunk);
            await fs.appendFile(errorPath, decodedChunk);
        }

        await ctx.replyWithDocument(new InputFile(logPath)).catch(() => { });
        await ctx.replyWithDocument(new InputFile(errorPath)).catch(() => { });

        await fs.writeFile(logPath, `[FINISHED] Build selesai. ${new Date().toISOString()}`);
        await fs.appendFile(logPath, child.stdout.toString());

        await fs.writeFile(errorPath, `[FINISHED] Build selesai. ${new Date().toISOString()}`);
        await fs.appendFile(errorPath, (child.stderr || '{}').toString());

        const duration = formatDistanceToNow(new Date(event.startedAt), { addSuffix: true });
        await ctx.reply(
            dedent`
          Build  : selesai.
          exitCode : ${child.exitCode}
          Durasi : ${duration}
          User   : @${event.user}`
        );

    } catch (error) {
        await fs.writeFile(logPath, '');
        await fs.appendFile(errorPath, `${error}\n`);
        ctx.reply('[ERROR] Build gagal');
    } finally {
        eventLock.delete(id);
        clearInterval(buildTimer as NodeJS.Timeout);
    }
}

// Handle shutdown signals
process.on('SIGINT', () => {
    eventLock.clear();
    teleBot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    eventLock.clear();
    bot.stop();
    process.exit(0);
});

const teleBot = {
    start: () => {
        bot.start();
        console.log('[BOT] Started');
    },
    stop: () => {
        bot.stop();
        console.log('[BOT] Stopped');
    },
    eventLock
}

export default teleBot;