/**
 * Get Available Models Tool
 *
 * Permite a los agentes consultar providers y modelos activos en la BD
 * para seleccionar el modelo óptimo al crear nuevos agentes.
 *
 * @category agents
 */

import type { Tool } from "../types.ts";
import { getHiveDB } from "../../storage/HiveDBStorage.ts";
import type { HiveProviderDoc, HiveModelDoc } from "../../storage/hiveSeed.ts";

export const getAvailableModelsTool: Tool = {
  name: "get_available_models",
  description: "Obtener lista de providers y modelos activos de la base de datos. Sinónimos: ver modelos, listar providers, modelos disponibles, consultar modelos, provider activo, qué modelos tengo, modelos para código, modelos para chat",
  parameters: {
    type: "object",
    properties: {
      providerId: {
        type: "string",
        description: "Opcional: filtrar por provider (openai, ollama, anthropic, gemini, etc.)"
      },
      modelType: {
        type: "string",
        description: "Opcional: filtrar por tipo (llm, stt, tts, vision, embedding)"
      },
      capabilities: {
        type: "string",
        description: "Opcional: filtrar por capacidad (coding, chat, analysis, vision, reasoning)"
      }
    },
  },
  execute: async (params: Record<string, unknown>) => {
    const { providerId, modelType, capabilities } = params as {
      providerId?: string;
      modelType?: string;
      capabilities?: string;
    };

    try {
      const db = await getHiveDB();
      const providersCol = db.collection<HiveProviderDoc>("providers");
      const modelsCol = db.collection<HiveModelDoc>("models");

      const [providers, models] = await Promise.all([
        providersCol.scan(),
        modelsCol.scan(),
      ]);

      const activeProviders = new Map(
        providers
          .filter(p => p.doc.enabled && p.doc.active)
          .map(p => [p.id, p.doc])
      );

      let rows = models
        .filter(m => m.doc.enabled && m.doc.active)
        .map(m => {
          const provider = activeProviders.get(m.doc.providerId);
          if (!provider) return null;
          return {
            providerId: provider.id,
            providerName: provider.name,
            providerCategory: provider.category,
            modelId: m.doc.id,
            modelName: m.doc.name,
            modelType: m.doc.modelType,
            contextWindow: m.doc.contextWindow ?? null,
            capabilities: m.doc.capabilities ?? null,
          };
        })
        .filter(Boolean) as Array<{
          providerId: string;
          providerName: string;
          providerCategory: string;
          modelId: string;
          modelName: string;
          modelType: string;
          contextWindow: number | null;
          capabilities: string[] | null;
        }>;

      if (providerId) {
        rows = rows.filter(r => r.providerId === providerId);
      }

      if (modelType) {
        rows = rows.filter(r => r.modelType === modelType);
      }

      if (capabilities) {
        const cap = capabilities.toLowerCase();
        rows = rows.filter(r => r.capabilities?.some(c => c.toLowerCase().includes(cap)));
      }

      rows.sort((a, b) => {
        if (a.providerName !== b.providerName) return a.providerName.localeCompare(b.providerName);
        return a.modelName.localeCompare(b.modelName);
      });

      return {
        ok: true,
        count: rows.length,
        models: rows,
      };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to get available models: ${(error as Error).message}`,
      };
    }
  },
};
