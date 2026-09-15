/**
 * Verificación y lectura de los webhooks de la WhatsApp Cloud API.
 *
 * Son funciones puras a propósito: quien las usa decide después qué hacer con
 * el mensaje. El canal del SDK arma un `IncomingMessage`; hive-cloud, que es
 * multi-inquilino sobre Postgres, arma una conversación, lo ingesta al CRM y lo
 * mete en su retén. Las dos cosas comparten exactamente esto: comprobar la
 * firma y entender el payload.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface WhatsAppReferral {
  /** Id del anuncio que originó la conversación (`source_id`). */
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  /** El identificador de clic que la Conversions API necesita para cerrar el círculo. */
  ctwaClid?: string;
}

export interface WhatsAppMediaRef {
  id: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
  /** `true` si es una nota de voz y no un archivo de audio adjunto. */
  voice?: boolean;
}

export type WhatsAppMediaKind = "audio" | "image" | "document" | "video" | "sticker";

export interface WhatsAppInbound {
  id: string;
  from: string;
  timestamp?: number;
  /** `text`, `image`, `audio`, `interactive`, `button`, `location`, … */
  type: string;
  text?: string;
  media?: WhatsAppMediaRef;
  mediaKind?: WhatsAppMediaKind;
  /** Respuesta a un botón o a una lista. */
  interactive?: { id: string; title?: string };
  referral?: WhatsAppReferral;
  profileName?: string;
  /** El mensaje tal como llegó, para lo que este tipo no cubra. */
  raw: unknown;
}

export interface WhatsAppStatusEvent {
  id: string;
  recipientId: string;
  /** `sent`, `delivered`, `read`, `failed`. */
  status: string;
  timestamp?: number;
  errors?: { code: number; title?: string }[];
}

export interface WhatsAppWebhookEvent {
  phoneNumberId: string;
  displayPhoneNumber?: string;
  messages: WhatsAppInbound[];
  statuses: WhatsAppStatusEvent[];
}

/**
 * Comprueba la firma `X-Hub-Signature-256` con el secreto de la app.
 *
 * Sin esto, cualquiera que conozca la URL puede inyectar conversaciones.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  );
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Resuelve el `hub.challenge` que Meta manda al registrar el webhook.
 *
 * El token se comprueba con un predicado en vez de compararlo acá porque cada
 * aplicación lo guarda distinto: el SDK tiene uno por canal, y hive-cloud tiene
 * un hash por cuenta de cliente y un token en texto plano para el número de
 * plataforma.
 */
export function verifyChallenge(
  query: URLSearchParams | Record<string, string | undefined>,
  isValidToken: (token: string) => boolean
): string | null {
  const get = (key: string): string | undefined =>
    query instanceof URLSearchParams ? (query.get(key) ?? undefined) : query[key];

  const mode = get("hub.mode");
  const token = get("hub.verify_token");
  const challenge = get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) return null;
  if (!isValidToken(token)) return null;
  return challenge;
}

/** Compara dos tokens en texto plano sin filtrar información por el tiempo. */
export function safeTokenEquals(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MEDIA_KINDS: WhatsAppMediaKind[] = ["audio", "image", "document", "video", "sticker"];

/**
 * Convierte el payload del webhook en eventos por número.
 *
 * Recorre **todas** las `entry` y `changes`: Meta puede agrupar varias
 * notificaciones en un mismo POST, y quedarse con `entry[0].changes[0]` pierde
 * mensajes en silencio.
 */
export function parseWebhook(body: unknown): WhatsAppWebhookEvent[] {
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return [];

  const events: WhatsAppWebhookEvent[] = [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const typed = change as { field?: string; value?: Record<string, any> };
      if (typed.field && typed.field !== "messages") continue;

      const value = typed.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const contacts: any[] = Array.isArray(value?.contacts) ? value!.contacts : [];
      const messages: WhatsAppInbound[] = [];
      const statuses: WhatsAppStatusEvent[] = [];

      for (const msg of Array.isArray(value?.messages) ? value!.messages : []) {
        messages.push(normalizeMessage(msg, contacts));
      }

      for (const status of Array.isArray(value?.statuses) ? value!.statuses : []) {
        statuses.push({
          id: String(status.id ?? ""),
          recipientId: String(status.recipient_id ?? ""),
          status: String(status.status ?? ""),
          timestamp: status.timestamp ? Number(status.timestamp) : undefined,
          errors: Array.isArray(status.errors)
            ? status.errors.map((e: any) => ({ code: Number(e.code), title: e.title }))
            : undefined,
        });
      }

      events.push({
        phoneNumberId: String(phoneNumberId),
        displayPhoneNumber: value?.metadata?.display_phone_number,
        messages,
        statuses,
      });
    }
  }

  return events;
}

function normalizeMessage(msg: any, contacts: any[]): WhatsAppInbound {
  const from = String(msg.from ?? "");
  const type = String(msg.type ?? "unknown");

  const inbound: WhatsAppInbound = {
    id: String(msg.id ?? ""),
    from,
    timestamp: msg.timestamp ? Number(msg.timestamp) : undefined,
    type,
    profileName: contacts.find((c) => c?.wa_id === from)?.profile?.name,
    raw: msg,
  };

  if (msg.referral?.source_id || msg.referral?.ctwa_clid) {
    inbound.referral = {
      sourceId: msg.referral.source_id ? String(msg.referral.source_id) : undefined,
      sourceUrl: msg.referral.source_url,
      sourceType: msg.referral.source_type,
      headline: msg.referral.headline,
      body: msg.referral.body,
      ctwaClid: msg.referral.ctwa_clid ? String(msg.referral.ctwa_clid) : undefined,
    };
  }

  if (type === "text") {
    inbound.text = msg.text?.body ?? "";
    return inbound;
  }

  if (MEDIA_KINDS.includes(type as WhatsAppMediaKind)) {
    const payload = msg[type] ?? {};
    inbound.mediaKind = type as WhatsAppMediaKind;
    inbound.media = {
      id: String(payload.id ?? ""),
      mimeType: payload.mime_type,
      caption: payload.caption,
      fileName: payload.filename,
      voice: payload.voice === true,
    };
    if (payload.caption) inbound.text = payload.caption;
    return inbound;
  }

  if (type === "interactive") {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    if (reply) {
      inbound.interactive = { id: String(reply.id ?? ""), title: reply.title };
      inbound.text = reply.title ?? reply.id;
    }
    return inbound;
  }

  if (type === "button") {
    inbound.interactive = { id: String(msg.button?.payload ?? ""), title: msg.button?.text };
    inbound.text = msg.button?.text ?? msg.button?.payload;
    return inbound;
  }

  return inbound;
}
