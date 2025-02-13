const dotenv = require('dotenv');
dotenv.config({
    path: './.env.local',
    override: true
});

const PORT = process.env.WIBU_PORT

if (!PORT) {
    console.error('[ERROR] PORT is not defined');
    process.exit(1);
}
module.exports = {
    "apps": [
        {
            "name": `wibu-bot-${PORT}`,
            "script": "bun",
            "args": "--bun --smol --env-file=/root/projects/wibu-bot/.env run start",
            "exec_mode": "fork",
            "instances": 1,
            "env": {
                "NODE_ENV": "production",
                "PORT": PORT
            },
            "max_memory_restart": "1G",
            "autorestart": true,
            "watch": false,
            "wait_ready": true,
            "restart_delay": 4000,
            "merge_logs": true,
            "time": true,
            "max_size": "10M",
            "retain": 5,
            "compress": true,
            "source_map_support": false,
            "cwd": "/root/projects/wibu-bot",
            "namespace": "wibu-bot"
        }
    ]
}
