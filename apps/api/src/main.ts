import { createApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

const env = loadEnv(process.env);
const app = await createApp();
await app.listen(env.API_PORT, '0.0.0.0');
