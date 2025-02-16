const NAME = process.env.WIBU_NAME
const PORT = process.env.WIBU_PORT
const CWD = process.env.WIBU_CWD

if (!PORT) {
    console.error('[ERROR] PORT is not defined');
    process.exit(1);
}
module.exports = {
    "apps": [
        {
            "name": `${NAME}-${PORT}`,
            "script": "bun",
            "args": "run start",
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
            "cwd": CWD,
            "namespace": NAME
        }
    ]
}
