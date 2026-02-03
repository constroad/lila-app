module.exports = {
  apps: [
    {
      name: 'lila-app-whatsapp',
      script: './dist/index.js',
      exec_mode: 'cluster',
      instances: 1,
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'data'],
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
