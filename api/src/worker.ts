import { pool } from './db';
import { runDeliveryLoop } from './services/deliveries';
import { runTelegramBot } from './services/telegramBot';

let stopping = false;
const shouldStop = () => stopping;

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`${sig} received: stopping the worker...`);
    stopping = true;
    setTimeout(() => process.exit(0), 3000).unref();   // don't wait for a long poll to finish
  });
}

async function main() {
  console.log('Worker started');
  await Promise.all([runDeliveryLoop(shouldStop), runTelegramBot(shouldStop)]);
  await pool.end();
  console.log('Worker stopped');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});