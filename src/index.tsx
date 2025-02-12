// src/index.ts
import cors from '@elysiajs/cors';
import { Html } from '@elysiajs/html';
import swagger from '@elysiajs/swagger';
import { spawn, Subprocess } from 'bun';
import { formatDistanceToNow } from 'date-fns';
import dedent from 'dedent';
import { config } from 'dotenv';
import Elysia, { file, HTTPMethod } from 'elysia';
import fs from 'fs/promises';
import { Bot, Context, InputFile } from 'grammy';
import moment from 'moment';
import path from 'path';
const appPackage = Bun.file('./package.json').json();
let host: string | null = null
const corsConfig = {
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT"] as HTTPMethod[],
  allowedHeaders: "*",
  exposedHeaders: "*",
  maxAge: 5,
  credentials: true,
};

let interval: NodeJS.Timeout | null = null
let timeout: NodeJS.Timeout | null = null
const app = new Elysia()
  .use(swagger({ path: "/api/docs" }))
  .use(cors(corsConfig))
  .get("/", ({ set }) => {
    set.headers = {
      "content-type": "text/html",
    }
    return (
      <html lang='en'>
        <body>
          <h1>Wibu Bot</h1>
        </body>
      </html>
    )
  })
  .group("/api", (app) => app
    .get('/logs/staging/:project', ({ params, request }) => {
      const { project } = params
      try {
        return file(`/tmp/wibu-bot/logs/build-${project}-out.log`)
      } catch (error) {
        console.error(error)
        return '[ERROR] File tidak ditemukan'
      }
    })
  )

try {
  await fs.mkdir('/tmp/wibu-bot/logs', { recursive: true })
} catch (error) {
  console.error(error)
  process.exit(1)
}

// Load environment variables
config({
  path: './.env',
  override: true,
});

type EventMessage = {
  id: string;
  user: string;
  command: string;
  startedAt: string;
};

// Validate BOT_TOKEN
const BOT_TOKEN = Bun.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be defined');
}

// Initialize Telegram bot
const bot = new Bot(BOT_TOKEN);

// Define available build commands
const commandBuildStaging = [
  {
    id: '1',
    project: 'hipmi',
    command: '/build_hipmi_staging',
    description: 'Build project hipmi staging',
  },
  {
    id: '2',
    project: 'darmasaba',
    command: '/build_darmasaba_staging',
    description: 'Build project darmasaba staging',
  },
];

// Define available build commands
const commandLogsStaging = [
  {
    id: '1',
    project: 'hipmi',
    command: '/log_build_hipmi_staging',
    description: 'Log project hipmi staging',
  },
  {
    id: '2',
    project: 'darmasaba',
    command: '/log_build_darmasaba_staging',
    description: 'Log project darmasaba staging',
  },
];

// Use a Map for efficient locking mechanism
const eventLock = new Map<string, EventMessage>();

// Handler for incoming messages
bot.on('message', async (ctx) => {
  const message = ctx.message.text;

  if (message === '/version') {
    const version = (await appPackage).version;

    await ctx.reply(dedent`
      version: ${version}
      `);
    return;
  }

  if (message === '/file') {
    const filePath = path.join(__dirname, '../package.json');
    await ctx.replyWithDocument(new InputFile(filePath));
  }

  if (message?.startsWith('/log')) {

    const command = commandLogsStaging.find((cmd) => cmd.command === message);

    if (!command) {
      const help = commandLogsStaging
        .map((command, index) => `${index + 1}. ${command.command} - ${command.description}`)
        .join('\n');
      const helpText = dedent`
      PANDUAN SEDERHANA
      ${help}
    `;
      await ctx.reply(helpText);
      return;
    }

    const logPath = `/tmp/wibu-bot/logs/build-${command.project.replace('log_build_', '')}-out.log`
    const errorPath = `/tmp/wibu-bot/logs/build-${command.project.replace('log_build_', '')}-err.log`
    await ctx.replyWithDocument(new InputFile(logPath)).catch(() => { ctx.reply('[ERROR] Log build tidak ditemukan.') })
    await ctx.replyWithDocument(new InputFile(errorPath)).catch(() => { })

  }

  // Handle /start command
  if (message === '/start') {
    const help = commandBuildStaging
      .map((command, index) => `${index + 1}. ${command.command} - ${command.description}`)
      .join('\n');
    const helpText = dedent`
      PANDUAN SEDERHANA
      ${help}
    `;
    await ctx.reply(helpText);
    return;
  }

  // Handle build commands
  if (message?.startsWith('/build')) {
    const command = commandBuildStaging.find((cmd) => cmd.command === message);
    if (!command) {
      await ctx.reply('Command tidak dikenali.');
      return;
    }

    const user = ctx.from.username || 'unknown';

    // Check if the command is already running
    if (eventLock.has(command.id)) {
      const lockedEvent = eventLock.get(command.id)!;
      console.log('[LOCKED]', `Command sedang dijalankan: ${lockedEvent.command}`);
      await ctx.reply(`Command ${command.project} sedang dijalankan oleh ${lockedEvent.user}, silakan coba lagi nanti.`);
      return;
    }

    // Add command to lock
    const event: EventMessage = {
      id: command.id,
      user,
      command: command.command,
      startedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
    };
    eventLock.set(command.id, event);

    // Process the build command
    processBuild({ ctx, command, event });
  }
});

let buildTimer: NodeJS.Timeout | null = null;
let count = 0
const decodedText = new TextDecoder();
let child: Subprocess<"ignore", "pipe", "inherit"> | null = null;
async function processBuild({ ctx, command, event }: { ctx: Context; command: any; event: EventMessage }) {
  buildTimer = setInterval(async () => {
    count++
    if (count > 15) {
      clearInterval(buildTimer as NodeJS.Timeout);
      ctx.reply(`[ERROR] processing selesai karena timeout , BUILD GAGAL`);
      child?.kill();
    }
  }, 1000 * 60) as NodeJS.Timeout;

  const logPath = `/tmp/wibu-bot/logs/build-${command.project}-out.log`
  const errorPath = `/tmp/wibu-bot/logs/build-${command.project}-err.log`
  await fs.unlink(logPath).catch(() => { })
  await fs.unlink(errorPath).catch(() => { })

  // Validasi nama proyek
  const safeProjectName = /^[a-zA-Z0-9_-]+$/.test(command.project)
    ? command.project
    : null;

  if (!safeProjectName) {
    await ctx.reply('[ERROR] Nama proyek tidak valid.');
    eventLock.delete(command.id); // Pastikan lock dihapus
    return;
  }

  try {
    await ctx.reply(`[INFO] Memulai build ${command.project}...`);
    child = spawn(["/bin/bash", 'build.sh'], {
      cwd: `/root/projects/staging/${safeProjectName}/scripts`
    })

    ctx.reply(`[INFO] log: ${Bun.env.HOST}/api/logs/staging/${command.project}`);
    ctx.reply(`[INFO] Build ${command.project} sedang dijalankan oleh @${event.user}, silakan tunggu selesai...`);
    for await (const chunk of child.stdout) {
      const decodedChunk = decodedText.decode(chunk);
      await fs.appendFile(logPath, decodedChunk);
    }

    await ctx.replyWithDocument(new InputFile(logPath));
    await ctx.replyWithDocument(new InputFile(errorPath));

    const duration = formatDistanceToNow(new Date(event.startedAt), { addSuffix: true });
    await ctx.reply(
      dedent`
        Build  : selesai.
        exitCode : ${child.exitCode}
        Durasi : ${duration}
        User   : @${event.user}`
    );

  } catch (error) {
    ctx.reply('[ERROR] Build gagal');
  } finally {
    eventLock.delete(command.id);
    clearInterval(buildTimer as NodeJS.Timeout);
  }
}

// Start polling for updates
bot.start();
app.listen(Bun.env.PORT, () => {
  console.log(`Listening on port ${Bun.env.PORT}`);
});

// Handle shutdown signals
process.on('SIGINT', () => {
  eventLock.clear();
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  eventLock.clear();
  bot.stop();
  process.exit(0);
});