// src/index.ts
import { $, spawn } from 'bun';
import dedent from 'dedent';
import { config } from 'dotenv';
import { Bot, Context } from 'grammy';
import moment from 'moment';
import fs from 'fs/promises'
import { formatDistanceToNow } from 'date-fns';
const appPackage = Bun.file('./package.json').json();
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

// Use a Map for efficient locking mechanism
const eventLock = new Map<string, EventMessage>();

// Handler for incoming messages
bot.on('message', async (ctx) => {
  const message = ctx.message.text;

  if (message === '/version') {
    const version = (await appPackage).version;
    await ctx.reply(`Version: ${version}`);
    return;
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

async function processBuild({ ctx, command, event }: { ctx: Context; command: any; event: EventMessage }) {
  // Validasi nama proyek
  const safeProjectName = /^[a-zA-Z0-9_-]+$/.test(command.project)
    ? command.project
    : null;

  if (!safeProjectName) {
    await ctx.reply('[ERROR] Nama proyek tidak valid.');
    eventLock.delete(command.id); // Pastikan lock dihapus
    return;
  }

  const decodedText = new TextDecoder();
  let messageBuffer: string = '';
  let logBuffer = '';
  let timeoutId;
  try {

    // Notify user that the build has started
    await ctx.reply(`[INFO] Memulai build ${command.project}...`);

    const bun = Bun.which("bun");
    if (!bun) {
      throw new Error("bun not found");
    }
    const child = spawn(["/bin/bash", 'build.sh'], {
      cwd: `/root/projects/staging/${safeProjectName}/scripts`
    })
    const timeout = 900000; // 5 menit
    timeoutId = setTimeout(() => {
      ctx.reply('[ERROR] Build dibatalkan karena timeout.');
      child.kill();
      throw new Error('Build process timed out');
    }, timeout);


    for await (const chunk of child.stdout) {
      const decodedChunk = decodedText.decode(chunk);
      messageBuffer += decodedChunk;
      logBuffer += `${decodedChunk}\n`;
      console.log(decodedChunk);

      // Kirim sisa buffer jika ada
      if (messageBuffer.length > 2000) {
        while (messageBuffer.length > 0) {
          // const partToSend = messageBuffer.slice(0, 2000); // Ambil 2000 karakter pertama
          ctx.reply(`[PROGRESS] ...`);
          // messageBuffer = messageBuffer.slice(2000); // Hapus bagian yang sudah dikirim
        }
      }
    }

    // Kirim sisa buffer jika ada
    // if (messageBuffer.length > 0) {
    //   await ctx.reply(`[PROGRESS]\n${messageBuffer}`);
    //   messageBuffer = '';
    // }

    ctx.reply(`[SUCCESS] Build ${command.project} selesai.`);
    const logPath = `/tmp/wibu-bot/logs/build-${command.project}-out.log`
    await Bun.write(logPath, logBuffer);
    await ctx.replyWithDocument(logPath);
    logBuffer = '';
  } catch (error) {
    console.error('[BUILD ERROR]', error);
    await ctx.reply(`[ERROR] Build gagal`);
    const errorPath = `/tmp/wibu-bot/logs/build-${command.project}-err.log`
    await Bun.write(errorPath, JSON.stringify(error));
    await ctx.replyWithDocument(errorPath);
  } finally {
    // Hapus lock setelah selesai
    eventLock.delete(command.id);
    clearTimeout(timeoutId);
    const duration = formatDistanceToNow(new Date(event.startedAt), { addSuffix: true });
    await ctx.reply(
      dedent`[INFO] Build selesai.
      Durasi: ${duration}
      User: @${event.user}`
    );
  }
}

// Start polling for updates
bot.start();

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