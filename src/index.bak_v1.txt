import dedent from 'dedent';
import { Bot, Context } from 'grammy';
import { $ } from 'bun';
import moment from 'moment';
import { formatDistanceToNow } from 'date-fns'

// Types
interface Command {
  id: string;
  project: string;
  command: string;
  description: string;
}

interface EventMessage {
  id: string;
  user: string;
  command: string;
  startedAt: string;
}

// Constants
const BOT_TOKEN = Bun.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN must be defined");
}

const COMMAND_BUILD_STAGING: Command[] = [
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
];

class BuildBot {
  private bot: Bot;
  private eventLock: EventMessage[] = [];
  private result: string = '';

  constructor(token: string) {
    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.on('message', this.handleMessage.bind(this));
  }

  private async handleStart(ctx: Context): Promise<void> {
    const help = COMMAND_BUILD_STAGING
      .map((command, k) => `${k + 1}. ${command.command} - ${command.description}`)
      .join('\n');

    const helpText = dedent`
      PANDUAN SEDERHANA

      ${help}
      
      Ketik salah satu command di atas untuk memulai build.
    `;

    await ctx.reply(helpText);
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const message = ctx.message?.text;
    if (!message?.startsWith('/build')) return;

    const command = COMMAND_BUILD_STAGING.find((cmd) => cmd.command === message);
    if (!command) {
      await ctx.reply('Command tidak ditemukan. Ketik /start untuk melihat daftar command.');
      return;
    }

    await this.processBuildCommand(ctx, command);
  }

  private async processBuildCommand(ctx: Context, command: Command): Promise<void> {
    const user = ctx.from?.username || 'unknown';

    // Check if command is locked
    if (this.isCommandLocked(command.id)) {
      const lockedEvent = this.eventLock.find(event => event.id === command.id);
      await ctx.reply(
        dedent`Command ${command.project} sedang dijalankan oleh @${lockedEvent?.user}.
        Dimulai: ${lockedEvent?.startedAt}
        Silakan coba lagi nanti.`
      );
      return;
    }

    // Add command to lock
    const event: EventMessage = {
      id: command.id,
      user,
      command: command.command,
      startedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
    };

    this.eventLock.push(event);

    try {
      this.executeBuild(ctx, command, event);
    } finally {
      this.removeLock(command.id);
    }
  }

  private async executeBuild(ctx: Context, command: Command, event: EventMessage): Promise<void> {
    try {
      await ctx.reply(`[INFO] Memulai build ${command.project}...`);

      // Execute build command
      const result = await $`/bin/bash build.sh`.cwd(`/root/projects/staging/${command.project}/scripts`);
      this.result = result.text();

      await ctx.reply('[INFO] Build berhasil.');
      await ctx.reply(`[OUTPUT] ${this.result}`);

    } catch (error) {
      console.error('[BUILD ERROR]', error);
      await ctx.reply('[ERROR] Build gagal.');
      this.result = String(error);

    } finally {
      const duration = formatDistanceToNow(new Date(event.startedAt), { addSuffix: true });
      await ctx.reply(
        dedent`[INFO] Build selesai.
        Durasi: ${duration}
        User: @${event.user}`
      );
      await ctx.reply(`[OUTPUT] ${this.result}`);
    }
  }

  private isCommandLocked(commandId: string): boolean {
    return this.eventLock.some(event => event.id === commandId);
  }

  private removeLock(commandId: string): void {
    this.eventLock = this.eventLock.filter(event => event.id !== commandId);
  }

  public start(): void {
    this.bot.start();
    console.log('[BOT] Starting...');
  }
}

// Initialize and start bot
const buildBot = new BuildBot(BOT_TOKEN);
buildBot.start();