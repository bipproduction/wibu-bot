// src/index.ts

import server from '@/server';
import { config } from 'dotenv';
import teleBot from '@/bot';

// Load environment variables
config({
  path: './.env.local',
  override: true,
});

if (!Bun.env.WIBU_PORT || !Bun.env.WIBU_BOT_TOKEN || !Bun.env.WIBU_LOGS_DIR || !Bun.env.WIBU_URL) {
  console.error('.env.local not found', import.meta.url);
  process.exit(1);
}

// Start polling for updates
teleBot.start().catch((err) => console.log("gramy bot tele error"));
server.start();