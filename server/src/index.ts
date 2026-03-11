import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { logInfo } from './lib/logger.js';
import { DEFAULT_MODELS } from './services/llm/llm-service.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  logInfo('server.boot', {
    port: config.port,
    defaultProvider: config.defaultProvider,
    defaultModel: config.modelOverride || DEFAULT_MODELS[config.defaultProvider],
    availableProviders: Object.keys(DEFAULT_MODELS)
  });
  console.log(`Server listening on http://localhost:${config.port}`);
});
