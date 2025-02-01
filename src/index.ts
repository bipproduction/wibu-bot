// src/index.ts
import dedent from 'dedent';
import { Bot } from 'grammy';
import { $ } from 'bun'
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


async function proccess({ ctx, command, event }: { ctx: any, command: any, event: EventMessage }) {
  try {

    await ctx.reply(`[INFO] Menjalankan command ${command.project}...`);

    console.log("[SLEEP]", 10000);
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Jalankan perintah shell
    const result = await $`/bin/bash build.sh`.cwd(`/root/projects/staging/${command.project}/scripts`);
    await ctx.reply('[INFO] Command berhasil dijalankan.');
    await ctx.reply(`[INFO] ${result.text()}`);

  } catch (error) {
    console.error(error);
    await ctx.reply('[ERROR] Gagal menjalankan command.');
    await ctx.reply(`[ERROR] ${error}`);
  } finally {
    console.log("[REMOVE LOCK]", event);
    eventLock = eventLock.filter((event) => event.id !== command.id);
    await ctx.reply('[INFO] Command selesai.');
    const duration = formatDistanceToNow(new Date(event.startedAt), { addSuffix: true });
    await ctx.reply(`[INFO] Selama: ${duration}`);
  }

}

// Mulai polling untuk menerima update
bot.start();