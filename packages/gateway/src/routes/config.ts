import type { Config } from "@hive-sdk/config/loader.ts";
import { getDb } from "@hive-sdk/storage/sqlite.ts";
import { decryptConfig } from "@hive-sdk/storage/crypto.ts";
import { redactConfig } from "../helpers/redact.ts";

export async function handleGetConfig(
  req: Request,
  addCorsHeaders: (r: Response, req: Request) => Response,
  config: Config
): Promise<Response> {
  return addCorsHeaders(Response.json(redactConfig(config)), req);
}
