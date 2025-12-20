module.exports = {
  apps: [
    {
      name: 'tote-backend',
      cwd: '/var/proyectos/tote-web/backend',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4003
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/.pm2/logs/tote-backend-error.log',
      out_file: '/root/.pm2/logs/tote-backend-out.log'
    },
    {
      name: 'tote-frontend',
      cwd: '/var/proyectos/tote-web/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 4006',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'https://toteback.atilax.io',
        NEXT_PUBLIC_SOCKET_URL: 'https://toteback.atilax.io'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/.pm2/logs/tote-frontend-error.log',
      out_file: '/root/.pm2/logs/tote-frontend-out.log'
    }
  ]
};
