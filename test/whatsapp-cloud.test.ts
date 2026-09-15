/**
 * WhatsApp por la API oficial de Meta (Cloud API).
 *
 * Lo que fijan estos tests es lo que se rompe solo si nadie lo mira:
 *
 * - **La firma.** Sin comprobar el HMAC, cualquiera que sepa la URL del webhook
 *   inyecta conversaciones en el agente.
 * - **La versión del Graph.** Caduca sola cada ~2 años y Meta redirige las
 *   llamadas a la más vieja que siga viva, sin avisar. hive-cloud quedó
 *   apuntando a v19 hasta que expiró.
 * - **El límite de 4096 caracteres.** Una respuesta larga de un agente no es
 *   rara; sin partirla, Meta la rechaza entera.
 * - **La ventana de 24 h.** Fuera de ella sólo se aceptan plantillas; el error
 *   131047 tiene que quedar distinguible de un fallo cualquiera.
 * - **Leer todas las `entry`.** Meta agrupa notificaciones: quedarse con la
 *   primera pierde mensajes en silencio.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect } from "bun:test";
import { createHmac } from "node:crypto";
import {
  WhatsAppCloudClient,
  WhatsAppCloudError,
  splitWhatsAppText,
  WHATSAPP_TEXT_LIMIT,
} from "../packages/core/src/channels/whatsapp-cloud/client";
import {
  parseWebhook,
  verifyChallenge,
  verifySignature,
} from "../packages/core/src/channels/whatsapp-cloud/webhook";
import {
  WhatsAppCloudChannel,
  type WhatsAppCloudConfig,
} from "../packages/core/src/channels/whatsapp-cloud/channel";
import { ChannelManager } from "../packages/core/src/channels/manager";
import type { IncomingMessage } from "../packages/core/src/channels/base";

const APP_SECRET = "secreto-de-la-app";
const PHONE_ID = "109990001";
const TOKEN = "EAAG-token";
const VERIFY_TOKEN = "hive_verify_abc";

function firmar(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Un POST de Meta, firmado como Meta lo firma. */
function peticion(body: unknown, signature?: string): Request {
  const raw = JSON.stringify(body);
  return new Request("https://hive.test/webhooks/whatsapp-cloud/acc1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature ?? firmar(raw),
    },
    body: raw,
  });
}

function cuerpoWebhook(
  messages: unknown[],
  extra: Record<string, unknown> = {},
  phoneNumberId = PHONE_ID
): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "573001112233", phone_number_id: phoneNumberId },
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

function mensajeTexto(id: string, texto: string, from = "573001234567"): unknown {
  return { id, from, timestamp: "1757600000", type: "text", text: { body: texto } };
}

interface Llamada {
  url: string;
  body: any;
  init: RequestInit;
}

/** `fetch` de mentira: registra lo enviado y responde lo que se le diga. */
function fetchFalso(
  responder: (url: string, body: any) => { status?: number; json: unknown } = () => ({
    json: { messages: [{ id: "wamid.ok" }] },
  })
): { llamadas: Llamada[]; fn: typeof fetch } {
  const llamadas: Llamada[] = [];
  const fn = (async (input: any, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    let body: any = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* se deja como vino */
      }
    }
    llamadas.push({ url, body, init });
    const r = responder(url, body);
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { llamadas, fn };
}

function errorDeMeta(code: number, message = "fallo"): { status: number; json: unknown } {
  return { status: 400, json: { error: { code, message, fbtrace_id: "trace-1" } } };
}

function canalDePrueba(
  overrides: Partial<WhatsAppCloudConfig> = {},
  responder?: (url: string, body: any) => { status?: number; json: unknown }
): { canal: WhatsAppCloudChannel; llamadas: Llamada[]; recibidos: IncomingMessage[] } {
  const { llamadas, fn } = fetchFalso(responder);
  const canal = new WhatsAppCloudChannel({
    enabled: true,
    accountId: "acc1",
    phoneNumberId: PHONE_ID,
    accessToken: TOKEN,
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
    dmPolicy: "open",
    allowFrom: [],
    fetch: fn,
    ...overrides,
  });
  const recibidos: IncomingMessage[] = [];
  canal.onMessage(async (m) => {
    recibidos.push(m);
  });
  return { canal, llamadas, recibidos };
}

/** El webhook contesta antes de procesar; hay que darle el turno al handler. */
async function asentar(): Promise<void> {
  await Bun.sleep(10);
}

// ─── Webhook: firma y verificación ───────────────────────────────────────────

describe("webhook: firma y verificación", () => {
  test("acepta sólo la firma HMAC que corresponde", () => {
    const raw = JSON.stringify({ hola: "mundo" });
    expect(verifySignature(raw, firmar(raw), APP_SECRET)).toBe(true);
    expect(verifySignature(raw, firmar(raw, "otro-secreto"), APP_SECRET)).toBe(false);
    expect(verifySignature(raw, null, APP_SECRET)).toBe(false);
    expect(verifySignature(raw, firmar(raw), "")).toBe(false);
  });

  test("devuelve el challenge sólo con modo y token correctos", () => {
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "1234",
    });
    expect(verifyChallenge(query, (t) => t === VERIFY_TOKEN)).toBe("1234");
    expect(verifyChallenge(query, () => false)).toBeNull();

    const otroModo = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "1234",
    });
    expect(verifyChallenge(otroModo, () => true)).toBeNull();
  });
});

// ─── Webhook: lectura del payload ────────────────────────────────────────────

describe("webhook: lectura del payload", () => {
  test("un texto, con el nombre del perfil", () => {
    const body = cuerpoWebhook([mensajeTexto("wamid.1", "hola")], {
      contacts: [{ wa_id: "573001234567", profile: { name: "Ana" } }],
    });
    const [evento] = parseWebhook(body);

    expect(evento!.phoneNumberId).toBe(PHONE_ID);
    expect(evento!.messages).toHaveLength(1);
    expect(evento!.messages[0]!.text).toBe("hola");
    expect(evento!.messages[0]!.profileName).toBe("Ana");
  });

  test("imagen con epígrafe, audio de voz y documento", () => {
    const body = cuerpoWebhook([
      {
        id: "wamid.img",
        from: "573001234567",
        type: "image",
        image: { id: "media-1", mime_type: "image/jpeg", caption: "mirá esto" },
      },
      {
        id: "wamid.aud",
        from: "573001234567",
        type: "audio",
        audio: { id: "media-2", mime_type: "audio/ogg", voice: true },
      },
      {
        id: "wamid.doc",
        from: "573001234567",
        type: "document",
        document: { id: "media-3", mime_type: "application/pdf", filename: "factura.pdf" },
      },
    ]);
    const mensajes = parseWebhook(body)[0]!.messages;

    expect(mensajes[0]!.mediaKind).toBe("image");
    expect(mensajes[0]!.text).toBe("mirá esto");
    expect(mensajes[1]!.media!.voice).toBe(true);
    expect(mensajes[2]!.media!.fileName).toBe("factura.pdf");
  });

  test("respuesta a un botón", () => {
    const body = cuerpoWebhook([
      {
        id: "wamid.btn",
        from: "573001234567",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí, quiero" } },
      },
    ]);
    const mensaje = parseWebhook(body)[0]!.messages[0]!;

    expect(mensaje.interactive).toEqual({ id: "si", title: "Sí, quiero" });
    expect(mensaje.text).toBe("Sí, quiero");
  });

  test("el anuncio que abrió la conversación (clic-a-WhatsApp)", () => {
    const body = cuerpoWebhook([
      {
        ...(mensajeTexto("wamid.ad", "vi su anuncio") as Record<string, unknown>),
        referral: {
          source_id: "120210000",
          source_type: "ad",
          source_url: "https://fb.me/x",
          headline: "50% de descuento",
          ctwa_clid: "clid-abc",
        },
      },
    ]);
    const referral = parseWebhook(body)[0]!.messages[0]!.referral!;

    // Sin el ctwa_clid no hay forma de devolverle la conversión a Meta.
    expect(referral.ctwaClid).toBe("clid-abc");
    expect(referral.sourceId).toBe("120210000");
    expect(referral.headline).toBe("50% de descuento");
  });

  test("eventos de estado (entregado/leído) no son mensajes", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: PHONE_ID },
                statuses: [
                  { id: "wamid.1", recipient_id: "573001234567", status: "delivered", timestamp: "1757600001" },
                ],
              },
            },
          ],
        },
      ],
    };
    const [evento] = parseWebhook(body);

    expect(evento!.messages).toHaveLength(0);
    expect(evento!.statuses[0]!.status).toBe("delivered");
  });

  test("recorre todas las entries y changes, no sólo la primera", () => {
    const body = {
      entry: [
        {
          changes: [
            { field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, messages: [mensajeTexto("w1", "uno")] } },
            { field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, messages: [mensajeTexto("w2", "dos")] } },
          ],
        },
        {
          changes: [
            { field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, messages: [mensajeTexto("w3", "tres")] } },
          ],
        },
      ],
    };

    const textos = parseWebhook(body).flatMap((e) => e.messages.map((m) => m.text));
    expect(textos).toEqual(["uno", "dos", "tres"]);
  });

  test("un payload que no es de mensajes no rompe nada", () => {
    expect(parseWebhook({})).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([]);
  });
});

// ─── Cliente ─────────────────────────────────────────────────────────────────

describe("cliente: versión del Graph", () => {
  test("por defecto usa la versión estable, no una caducada", async () => {
    const { llamadas, fn } = fetchFalso();
    await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
      .sendText("573001234567", "hola");

    expect(llamadas[0]!.url).toBe(`https://graph.facebook.com/v26.0/${PHONE_ID}/messages`);
  });

  test("respeta META_GRAPH_API_VERSION y la versión explícita", async () => {
    const previo = process.env.META_GRAPH_API_VERSION;
    process.env.META_GRAPH_API_VERSION = "v25.0";
    try {
      const { llamadas, fn } = fetchFalso();
      await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
        .sendText("573001234567", "hola");
      expect(llamadas[0]!.url).toContain("/v25.0/");

      const otro = fetchFalso();
      await new WhatsAppCloudClient({
        phoneNumberId: PHONE_ID,
        accessToken: TOKEN,
        graphVersion: "v24.0",
        fetch: otro.fn,
      }).sendText("573001234567", "hola");
      expect(otro.llamadas[0]!.url).toContain("/v24.0/");
    } finally {
      if (previo === undefined) delete process.env.META_GRAPH_API_VERSION;
      else process.env.META_GRAPH_API_VERSION = previo;
    }
  });
});

describe("cliente: envío", () => {
  test("un texto corto sale en un mensaje con el payload de Meta", async () => {
    const { llamadas, fn } = fetchFalso();
    const ids = await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
      .sendText("573001234567", "hola");

    expect(ids).toEqual(["wamid.ok"]);
    expect(llamadas[0]!.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "573001234567",
      type: "text",
      text: { preview_url: false, body: "hola" },
    });
    expect((llamadas[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  test("una respuesta larga se parte en varios mensajes en orden", async () => {
    const { llamadas, fn } = fetchFalso();
    const largo = Array.from({ length: 60 }, (_, i) => `Párrafo ${i}: ${"x".repeat(100)}`).join("\n\n");
    expect(largo.length).toBeGreaterThan(WHATSAPP_TEXT_LIMIT);

    await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
      .sendText("573001234567", largo);

    expect(llamadas.length).toBeGreaterThan(1);
    for (const llamada of llamadas) {
      expect(llamada.body.text.body.length).toBeLessThanOrEqual(WHATSAPP_TEXT_LIMIT);
    }
    // El orden importa: en paralelo llegarían desordenados.
    expect(llamadas[0]!.body.text.body.startsWith("Párrafo 0")).toBe(true);
  });

  test("splitWhatsAppText corta por párrafos y nunca pasa el límite", () => {
    expect(splitWhatsAppText("corto")).toEqual(["corto"]);
    expect(splitWhatsAppText("")).toEqual([]);

    const dos = splitWhatsAppText(`${"a".repeat(3000)}\n\n${"b".repeat(3000)}`);
    expect(dos).toHaveLength(2);
    expect(dos[0]).toBe("a".repeat(3000));

    // Una línea sola más larga que el límite se parte igual.
    const gigante = splitWhatsAppText("z".repeat(10000));
    expect(gigante.length).toBe(3);
    for (const trozo of gigante) expect(trozo.length).toBeLessThanOrEqual(WHATSAPP_TEXT_LIMIT);
  });

  test("marcar leído y mostrar 'escribiendo…' es una sola llamada", async () => {
    const { llamadas, fn } = fetchFalso();
    const cliente = new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn });

    await cliente.markRead("wamid.1", { typing: true });
    expect(llamadas[0]!.body).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.1",
      typing_indicator: { type: "text" },
    });

    await cliente.markRead("wamid.2");
    expect(llamadas[1]!.body.typing_indicator).toBeUndefined();
  });

  test("la plantilla viaja con su idioma y sus componentes", async () => {
    const { llamadas, fn } = fetchFalso();
    await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
      .sendTemplate("573001234567", { name: "recordatorio", language: "es_CO", components: [] });

    expect(llamadas[0]!.body.type).toBe("template");
    expect(llamadas[0]!.body.template).toEqual({
      name: "recordatorio",
      language: { code: "es_CO" },
      components: [],
    });
  });

  test("bajar un medio son dos pasos: la url firmada y el archivo", async () => {
    const { llamadas, fn } = fetchFalso((url) => {
      if (url.endsWith("/media-1")) {
        return { json: { url: "https://lookaside.fb.test/archivo", mime_type: "audio/ogg" } };
      }
      return { json: { contenido: "binario" } };
    });

    const medio = await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn })
      .downloadMedia("media-1");

    expect(llamadas).toHaveLength(2);
    expect(llamadas[1]!.url).toBe("https://lookaside.fb.test/archivo");
    // La url firmada también exige el token.
    expect((llamadas[1]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(medio.mimeType).toBe("audio/ogg");
    expect(medio.buffer.length).toBeGreaterThan(0);
  });
});

describe("cliente: errores de Meta", () => {
  test("131047 es 'se cerró la ventana de 24 h', no un fallo cualquiera", async () => {
    const { fn } = fetchFalso(() => errorDeMeta(131047, "Re-engagement message"));
    const cliente = new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: fn });

    const error = await cliente.sendText("573001234567", "hola").catch((e) => e);
    expect(error).toBeInstanceOf(WhatsAppCloudError);
    expect(error.windowClosed).toBe(true);
    expect(error.retryable).toBe(false);
    expect(error.fbtraceId).toBe("trace-1");
  });

  test("caudal y token distinguibles", async () => {
    const caudal = fetchFalso(() => errorDeMeta(130429));
    const errorCaudal = await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: caudal.fn })
      .sendText("573001234567", "x")
      .catch((e) => e);
    expect(errorCaudal.rateLimited).toBe(true);
    expect(errorCaudal.retryable).toBe(true);

    const token = fetchFalso(() => errorDeMeta(190));
    const errorToken = await new WhatsAppCloudClient({ phoneNumberId: PHONE_ID, accessToken: TOKEN, fetch: token.fn })
      .sendText("573001234567", "x")
      .catch((e) => e);
    expect(errorToken.tokenExpired).toBe(true);
  });
});

// ─── Canal ───────────────────────────────────────────────────────────────────

describe("canal: el webhook", () => {
  test("la verificación de Meta devuelve el challenge", async () => {
    const { canal } = canalDePrueba();
    const url = `https://hive.test/webhooks/whatsapp-cloud/acc1?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=98765`;

    const ok = await canal.handleWebhook(new Request(url));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("98765");

    const malo = await canal.handleWebhook(
      new Request(url.replace(VERIFY_TOKEN, "token-robado"))
    );
    expect(malo.status).toBe(403);
  });

  test("una firma inválida se rechaza y no llega nada al agente", async () => {
    const { canal, recibidos } = canalDePrueba();

    const res = await canal.handleWebhook(
      peticion(cuerpoWebhook([mensajeTexto("wamid.1", "hola")]), "sha256=falsa")
    );

    expect(res.status).toBe(401);
    await asentar();
    expect(recibidos).toHaveLength(0);
  });

  test("un mensaje válido llega al agente con su contexto", async () => {
    const { canal, llamadas, recibidos } = canalDePrueba();

    const res = await canal.handleWebhook(
      peticion(
        cuerpoWebhook(
          [
            {
              ...(mensajeTexto("wamid.1", "quiero comprar") as Record<string, unknown>),
              referral: { source_id: "120", ctwa_clid: "clid-1" },
            },
          ],
          { contacts: [{ wa_id: "573001234567", profile: { name: "Ana" } }] }
        )
      )
    );
    expect(res.status).toBe(200);

    await asentar();
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]!.channel).toBe("whatsapp_cloud");
    expect(recibidos[0]!.content).toBe("quiero comprar");
    expect(recibidos[0]!.peerId).toBe("573001234567");
    expect((recibidos[0]!.metadata as any).referral.ctwaClid).toBe("clid-1");
    expect((recibidos[0]!.metadata as any).pushName).toBe("Ana");

    // El acuse de recibo sale ya: doble tilde y "escribiendo…".
    const acuse = llamadas.find((l) => l.body?.status === "read");
    expect(acuse!.body.typing_indicator).toEqual({ type: "text" });
  });

  test("contesta 200 sin esperar el turno del agente", async () => {
    const { canal } = canalDePrueba();
    let liberar: () => void = () => {};
    const turno = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let terminado = false;
    canal.onMessage(async () => {
      await turno;
      terminado = true;
    });

    const res = await canal.handleWebhook(peticion(cuerpoWebhook([mensajeTexto("wamid.1", "hola")])));

    // Meta reintenta lo que tarde y termina desuscribiendo la app.
    expect(res.status).toBe(200);
    expect(terminado).toBe(false);
    liberar();
  });

  test("el mismo mensaje dos veces se procesa una sola vez", async () => {
    const { canal, recibidos } = canalDePrueba();
    const cuerpo = cuerpoWebhook([mensajeTexto("wamid.repetido", "hola")]);

    await canal.handleWebhook(peticion(cuerpo));
    await canal.handleWebhook(peticion(cuerpo));
    await asentar();

    expect(recibidos).toHaveLength(1);
  });

  test("ignora los eventos de otro número del mismo WABA", async () => {
    const { canal, recibidos } = canalDePrueba();

    await canal.handleWebhook(
      peticion(cuerpoWebhook([mensajeTexto("wamid.1", "hola")], {}, "999-otro-numero"))
    );
    await asentar();

    expect(recibidos).toHaveLength(0);
  });

  test("con lista permitida, sólo pasan los de la lista", async () => {
    const { canal, recibidos } = canalDePrueba({
      dmPolicy: "allowlist",
      allowFrom: ["573009999999"],
    });

    await canal.handleWebhook(peticion(cuerpoWebhook([mensajeTexto("wamid.1", "hola", "573001234567")])));
    await asentar();
    expect(recibidos).toHaveLength(0);

    await canal.handleWebhook(peticion(cuerpoWebhook([mensajeTexto("wamid.2", "hola", "573009999999")])));
    await asentar();
    expect(recibidos).toHaveLength(1);
  });

  test("baja el audio de una nota de voz y lo entrega al agente", async () => {
    const { canal, recibidos } = canalDePrueba({}, (url) => {
      if (url.endsWith("/media-9")) return { json: { url: "https://lookaside.fb.test/a", mime_type: "audio/ogg" } };
      return { json: { messages: [{ id: "wamid.ok" }] } };
    });

    await canal.handleWebhook(
      peticion(
        cuerpoWebhook([
          { id: "wamid.voz", from: "573001234567", type: "audio", audio: { id: "media-9", mime_type: "audio/ogg", voice: true } },
        ])
      )
    );
    await asentar();

    expect(recibidos[0]!.audio?.buffer).toBeDefined();
    expect(recibidos[0]!.content).toBe("[Audio message]");
  });
});

describe("canal: el envío", () => {
  test("la narración de progreso no se manda: se cobra por mensaje", async () => {
    const { canal, llamadas } = canalDePrueba();

    await canal.send("573001234567", { type: "progress", sessionId: "573001234567", content: "pensando…" });

    expect(llamadas.filter((l) => l.body?.type === "text")).toHaveLength(0);
  });

  test("con sendProgress encendido sí se manda", async () => {
    const { canal, llamadas } = canalDePrueba({ sendProgress: true });

    await canal.send("573001234567", { type: "progress", sessionId: "573001234567", content: "pensando…" });

    expect(llamadas.filter((l) => l.body?.type === "text")).toHaveLength(1);
  });

  test("una respuesta normal sale como texto", async () => {
    const { canal, llamadas } = canalDePrueba();

    await canal.send("573001234567", { type: "message", sessionId: "573001234567", content: "listo" });

    expect(llamadas[0]!.body.text.body).toBe("listo");
    expect(llamadas[0]!.body.to).toBe("573001234567");
  });

  test("fuera de la ventana, manda la plantilla configurada", async () => {
    const { canal, llamadas } = canalDePrueba(
      { windowFallbackTemplate: { name: "reenganche", language: "es" } },
      (_url, body) => (body?.type === "text" ? errorDeMeta(131047) : { json: { messages: [{ id: "wamid.t" }] } })
    );

    await canal.send("573001234567", { type: "message", sessionId: "573001234567", content: "hola de nuevo" });

    expect(llamadas.at(-1)!.body.type).toBe("template");
    expect(llamadas.at(-1)!.body.template.name).toBe("reenganche");
  });

  test("fuera de la ventana y sin plantilla, el error lo dice claro", async () => {
    const { canal } = canalDePrueba({}, () => errorDeMeta(131047));

    const error = await canal
      .send("573001234567", { type: "message", sessionId: "573001234567", content: "hola" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(WhatsAppCloudError);
    expect(error.windowClosed).toBe(true);
    expect(error.message).toContain("plantilla");
  });
});

// ─── Manager ─────────────────────────────────────────────────────────────────

describe("manager: enrutado del webhook", () => {
  test("crea la cuenta y le entrega lo que llega a su URL", async () => {
    const manager = new ChannelManager({} as any);
    const { fn } = fetchFalso();
    await manager.addChannel("whatsapp_cloud", "acc1", {
      phoneNumberId: PHONE_ID,
      accessToken: TOKEN,
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      dmPolicy: "open",
      fetch: fn,
    });

    const res = await manager.handleWebhook(
      "whatsapp_cloud",
      "acc1",
      peticion(cuerpoWebhook([mensajeTexto("wamid.1", "hola")]))
    );

    expect(res.status).toBe(200);
    expect(manager.getChannelStatus("whatsapp_cloud", "acc1").status).toBe("connected");
  });

  test("una cuenta que no está levantada da 404, no un 500", async () => {
    const manager = new ChannelManager({} as any);
    const res = await manager.handleWebhook("whatsapp_cloud", "fantasma", peticion(cuerpoWebhook([])));
    expect(res.status).toBe(404);
  });
});

// ─── Efectos al importar ─────────────────────────────────────────────────────

describe("importar el SDK no arrastra Baileys", () => {
  test("process.stderr.write queda intacto", async () => {
    const original = process.stderr.write;
    await import("../packages/core/src/index");
    // Baileys parchea stderr al cargarse; si esto falla, volvió a importarse
    // arriba del archivo y hive-cloud lo carga sin usar ningún canal.
    expect(process.stderr.write).toBe(original);
  });
});
