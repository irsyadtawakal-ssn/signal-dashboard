module.exports = {
  apps: [
    {
      name: 'signal-dashboard',
      script: 'src/server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      kill_timeout: 5000,
      max_memory_restart: '300M',
      env_file: '.env',
      out_file: 'logs/app.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
