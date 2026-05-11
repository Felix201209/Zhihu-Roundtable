import { loadLocalEnv } from "./env.js";
import { startBackendServer } from "./http-server.js";

loadLocalEnv();

const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR;

startBackendServer({ port, staticDir })
  .then((server) => {
    const staticMessage = staticDir ? `，并托管静态目录 ${staticDir}` : "";
    console.log(`知辩圆桌后端已启动：http://localhost:${server.port}${staticMessage}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
