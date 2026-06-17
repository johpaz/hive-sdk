import type { Config } from "@johpaz/hive-sdk";

export default {
  name: "{{APP_NAME}}",
  gateway: {
    host: process.env.HIVE_HOST ?? "127.0.0.1",
    port: Number(process.env.HIVE_PORT ?? 18790),
  },
  channels: {
    webchat: { enabled: true },
    telegram: { enabled: false },
    discord: { enabled: false },
    whatsapp: { enabled: false },
    slack: { enabled: false },
  },
  database: {
    path: process.env.HIVE_DATA_DIR ?? "./data/hive.db",
  },
} satisfies Config;
