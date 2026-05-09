import { loadLocalEnv } from "./env.js";
import { startBackendServer } from "./http-server.js";

loadLocalEnv();

const port = Number(process.env.PORT ?? 8787);

startBackendServer({ port })
  .then((server) => {
    console.log(`知辩圆桌后端已启动：http://localhost:${server.port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
