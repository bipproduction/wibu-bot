// src/index.ts
import dedent from 'dedent';
import { Bot, Context } from 'grammy';
import { $, readableStreamToText, spawn } from 'bun'
import moment from 'moment';
import { config } from 'dotenv'
import { formatDistanceToNow } from 'date-fns';

config({
  path: './.env',
  override: true
})

type EventMessage = { id: string, user: string, command: string, startedAt: string }

// Ganti dengan token bot Anda
const BOT_TOKEN = Bun.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN must be defined");
}

// Inisialisasi bot Telegram
const bot = new Bot(BOT_TOKEN);

const commandBuildStaging = [
  {
    id: "1",
    project: 'hipmi',
    command: '/build_hipmi_staging',
    description: 'build project hipmi staging'
  },
  {
    id: "2",
    project: 'darmasaba',
    command: '/build_darmasaba_staging',
    description: 'build project darmasaba staging'
  }
]

let eventLock: EventMessage[] = [];

// Handler untuk menerima pesan
bot.on('message', async (ctx) => {
  const message = ctx.message.text;

  if (message === '/start') {
    const help = commandBuildStaging.map((command, k) => k + 1 + '. ' + command.command).join('\n');
    const helpText = dedent`
    PANDUAN SEDERHANA

    ${help}
    `
    await ctx.reply(helpText);
  }

  console.log("[MESSAGE]", ctx.message.text);

  if (message?.startsWith('/build')) {
    const command = commandBuildStaging.find((cmd) => cmd.command === message);
    if (!command) return;

    // Cek apakah perintah sedang berjalan
    const isLocked = eventLock.find((event) => event.id === command.id);
    const user = ctx.from.username || 'unknown';

    if (isLocked) {
      console.log("[LOCKED]", "Command sedang dijalankan", isLocked.command);
      await ctx.reply(`Command ${command.project} sedang dijalankan, silakan coba lagi nanti.`);
      return;
    }


    // Tambahkan perintah ke eventLock
    const event = {
      id: command.id,
      user: user,
      command: command.command,
      startedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
    };

    console.log("[ADD LOCK]", event);
    eventLock.push(event);

    // Jalankan perintah
    proccess({ ctx, command, event });

  }

});


async function proccess({ ctx, command, event }: { ctx: Context, command: any, event: EventMessage }) {
  try {
    ctx.reply(`[INFO] Memulai build ${command.project}...`);
    const build = spawn([`/bin/bash`, `build.sh`], {
      cwd: `/root/projects/staging/${command.project}/scripts`,
    })
    const res = await readableStreamToText(build.stdout)
    console.log(res)
    ctx.reply("[INFO] Build selesai.")
    // time
    ctx.reply(`[INFO] Durasi: ${formatDistanceToNow(new Date(event.startedAt), { addSuffix: true })}`)
    eventLock = eventLock.filter((e) => e.id !== command.id);
    await Bun.write(`/tmp/wibu-bot/${command.project}-build.log`, res)
  } catch (error) {
    console.error(error)
    ctx.reply("[ERROR] Build gagal.")
    ctx.reply(String(error).substring(0, 4096))
    ctx.reply(`[INFO] Durasi: ${formatDistanceToNow(new Date(event.startedAt), { addSuffix: true })}`)
    eventLock = eventLock.filter((e) => e.id !== command.id);
    await Bun.write(`/tmp/wibu-bot/${command.project}-error.log`, String(error))

  }
}

// Mulai polling untuk menerima update
bot.start();

process.on('SIGINT', () => {
  eventLock = [];
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  eventLock = [];
  bot.stop();
  process.exit(0);
});