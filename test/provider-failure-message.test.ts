/**
 * NVIDIA responde 404 "Not found for account" para modelos que figuran en su
 * catálogo público pero no están habilitados para esa key (verificado el
 * 2026-09-10 con moonshotai/kimi-k2.6). Decir que "se retiró" mandaba al
 * usuario a buscar un modelo que sí existe.
 */

import { describe, expect, test } from "bun:test";
import { describeProviderFailure } from "../packages/core/src/agent/llm-client.ts";

describe("llm-client: mensaje de un 404 del proveedor", () => {
  test("un 404 por cuenta dice que el modelo no está habilitado, no que se retiró", () => {
    const err = new Error(`404 {"type":"about:blank","title":"Not Found","status":404,"detail":"Function '23d4f03a': Not found for account 'ffXBHyDNUF'"}`);
    const msg = describeProviderFailure(err, 404, "nvidia", "moonshotai/kimi-k2.6");
    expect(msg).toContain("no tiene habilitado");
    expect(msg).toContain("moonshotai/kimi-k2.6");
    expect(msg).toContain("Ajustes → Proveedores");
    expect(msg).not.toContain("retiró");
    expect(msg).not.toContain("ffXBHyDNUF");
  });

  test("un 404 genérico sigue diciendo que el modelo ya no existe", () => {
    const msg = describeProviderFailure(new Error("Not Found"), 404, "nvidia", "z-ai/glm-5.2");
    expect(msg).toContain("ya no existe");
    expect(msg).toContain("z-ai/glm-5.2");
  });
});
