// pm2 生态配置：XBed API 独立进程（与官网 xuanjian-guild 隔离）
module.exports = {
  apps: [
    {
      name: 'xbed-api',
      cwd: '/var/www/xbed/api',
      script: 'dist/index.js',
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=320',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        PORT: '3939',
      },
      out_file: '/var/www/xbed/logs/api-out.log',
      error_file: '/var/www/xbed/logs/api-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
