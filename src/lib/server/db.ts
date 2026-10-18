import postgres from "postgres";
import { dataMode } from "../domain";
export type Database = ReturnType<typeof postgres>;
const globalDb = globalThis as typeof globalThis & {
  neighborhoodDb?: Database;
};
export function database(): Database {
  if (dataMode(process.env) !== "database" || !process.env.DATABASE_URL)
    throw new Error("DATABASE_NOT_CONFIGURED");
  return (globalDb.neighborhoodDb ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => {},
  }));
}
