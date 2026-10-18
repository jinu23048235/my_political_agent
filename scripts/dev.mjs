import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0"], {
  stdio: "inherit", env: { ...process.env, APP_DATA_MODE: process.env.APP_DATA_MODE ?? (process.env.DATABASE_URL ? "database" : "sample") }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
