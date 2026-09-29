/** PM2 process file — keeps the API running after PuTTY/SSH disconnect and on reboot. */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "zimson",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
      args: "--tsconfig server/tsconfig.json server/index.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 200,
      kill_timeout: 8000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
