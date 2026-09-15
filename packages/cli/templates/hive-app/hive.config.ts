import type { Config } from "@johpaz/hive-sdk";

/**
 * Configuración de {{APP_NAME}}.
 *
 * La ruta de la base no se configura acá: HiveDB vive en `<HIVE_HOME>/data`, o
 * en `HIVE_DB_PATH` si lo definís. Usá `HIVE_DB_PATH=":memory:"` para una base
 * efímera (tests).
 */
export default {
  gateway: {
    host: process.env.HIVE_HOST ?? "127.0.0.1",
    port: Number(process.env.HIVE_PORT ?? 18790),
  },
  channels: {
    webchat: { enabled: true },
    telegram: { enabled: false },
    discord: { enabled: false },
    // WhatsApp por la API oficial de Meta. Es el camino para un negocio:
    // número propio de WhatsApp Business, plantillas y atribución de los
    // anuncios que abren la conversación. Recibe por webhook, así que hace
    // falta exponer `/webhooks/whatsapp-cloud/<cuenta>` con HTTPS público.
    whatsapp_cloud: { enabled: false },
    // WhatsApp por código QR (Baileys). No es oficial: sirve para uso
    // personal, no para un negocio, y el número puede terminar bloqueado.
    whatsapp: { enabled: false },
    slack: { enabled: false },
  },
  logging: {
    level: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "info",
  },
} satisfies Config;
