/**
 * api_request - Make generic HTTP requests to connect REST APIs
 *
 * @category web
 * @seedId api_request
 * @spanish conectar api, peticion http, llamada api, rest api, endpoint
 */

import type { Tool } from "../types.ts";
import { logger } from "../../utils/logger.ts";

const log = logger.child("api-request");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_CHARS = 100_000;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
export type ResponseFormat = "auto" | "json" | "text" | "binary";

export interface ApiAuthBearer {
  type: "bearer";
  token: string;
}

export interface ApiAuthBasic {
  type: "basic";
  username: string;
  password: string;
}

export interface ApiAuthApiKey {
  type: "api_key";
  in: "header" | "query";
  name: string;
  value: string;
}

export type ApiAuth = ApiAuthBearer | ApiAuthBasic | ApiAuthApiKey;

function applyAuth(
  url: string,
  init: RequestInit,
  auth?: ApiAuth
): { url: string; init: RequestInit } {
  if (!auth) return { url, init };

  const headers = new Headers(init.headers);

  switch (auth.type) {
    case "bearer":
      headers.set("Authorization", `Bearer ${auth.token}`);
      break;
    case "basic": {
      const credentials = btoa(`${auth.username}:${auth.password}`);
      headers.set("Authorization", `Basic ${credentials}`);
      break;
    }
    case "api_key":
      if (auth.in === "query") {
        const parsed = new URL(url);
        parsed.searchParams.set(auth.name, auth.value);
        url = parsed.toString();
      } else {
        headers.set(auth.name, auth.value);
      }
      break;
  }

  return { url, init: { ...init, headers } };
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function parseResponse(
  response: Response,
  format: ResponseFormat
): Promise<{ data: unknown; contentType: string }> {
  const contentType = response.headers.get("content-type") || "";

  if (format === "json" || (format === "auto" && contentType.includes("application/json"))) {
    const json = await response.json();
    return { data: json, contentType };
  }

  if (format === "text" || (format === "auto" && contentType.includes("text/"))) {
    const text = await response.text();
    return { data: text.slice(0, MAX_RESPONSE_CHARS), contentType };
  }

  if (format === "binary") {
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { data: base64, contentType };
  }

  // Fallback: try text, then JSON
  const text = await response.text();
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return { data: JSON.parse(text), contentType };
    } catch {
      /* fallthrough */
    }
  }
  return { data: text.slice(0, MAX_RESPONSE_CHARS), contentType };
}

export const apiRequestTool: Tool = {
  name: "api_request",
  description:
    "Connect to REST APIs: make HTTP requests with methods, headers, body and authentication. Spanish: conectar api, peticion http, llamada api, rest api, endpoint, bearer, api key",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The API endpoint URL (http:// or https://)",
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        description: "HTTP method (default: GET)",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Optional HTTP headers as key-value pairs",
      },
      body: {
        type: "string",
        description: "Request body. Objects should be passed as JSON strings; strings are sent as-is",
      },
      auth: {
        type: "object",
        description: "Optional authentication configuration",
        properties: {
          type: {
            type: "string",
            enum: ["bearer", "basic", "api_key"],
          },
          token: { type: "string" },
          username: { type: "string" },
          password: { type: "string" },
          in: { type: "string", enum: ["header", "query"] },
          name: { type: "string" },
          value: { type: "string" },
        },
        required: ["type"],
      },
      timeoutMs: {
        type: "number",
        description: "Request timeout in milliseconds (default: 30000)",
      },
      responseFormat: {
        type: "string",
        enum: ["auto", "json", "text", "binary"],
        description: "How to parse the response (default: auto)",
      },
    },
    required: ["url"],
  },
  execute: async (params: Record<string, unknown>) => {
    const url = params.url as string;
    const method = (params.method as HttpMethod) ?? "GET";
    const headers = (params.headers as Record<string, string>) ?? {};
    const bodyParam = params.body;
    const auth = params.auth as ApiAuth | undefined;
    const timeoutMs = (params.timeoutMs as number) ?? DEFAULT_TIMEOUT_MS;
    const responseFormat = (params.responseFormat as ResponseFormat) ?? "auto";

    if (!isValidHttpUrl(url)) {
      return { ok: false, error: "Invalid URL. Only http:// and https:// are allowed." };
    }

    log.info(`API request: ${method} ${url}`);

    let body: BodyInit | undefined;
    const finalHeaders: Record<string, string> = { ...headers };

    if (bodyParam !== undefined) {
      if (typeof bodyParam === "string") {
        body = bodyParam;
      } else {
        body = JSON.stringify(bodyParam);
        if (!finalHeaders["content-type"] && !finalHeaders["Content-Type"]) {
          finalHeaders["content-type"] = "application/json";
        }
      }
    }

    let init: RequestInit = {
      method,
      headers: finalHeaders,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    };

    const final = applyAuth(url, init, auth);

    try {
      const response = await fetch(final.url, final.init);
      const { data, contentType } = await parseResponse(response, responseFormat);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: final.url,
        contentType,
        headers: responseHeaders,
        data,
      };

      if (!response.ok) {
        log.warn(`API request returned ${response.status} for ${final.url}`);
        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}`, ...result };
      }

      log.info(`API request successful: ${response.status} ${final.url}`);
      return result;
    } catch (error) {
      const message = (error as Error).message;
      log.error(`API request failed: ${message}`);
      return { ok: false, error: `API request failed: ${message}` };
    }
  },
};
