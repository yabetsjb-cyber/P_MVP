import { buildApp } from './app';
import { config } from './config';

buildApp()
  .then((app) => app.listen({ port: config.port, host: '0.0.0.0' }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });