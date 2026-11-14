import { loadConfig } from './config.js';
import { createApplication } from './app.js';
process.umask(0o077);
const config = loadConfig();
const { server, db } = createApplication(config);
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Artist platform listening; configured origin: ${config.origin}; accounting disabled`));
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
