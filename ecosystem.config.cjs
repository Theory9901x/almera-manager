module.exports = {
  apps: [
    {
      name: 'sgimr',
      script: 'server/index.mjs',
      cwd: '/opt/sgimr/current',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3100',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      time: true,
    },
  ],
}
