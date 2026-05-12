import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  schema?: z.ZodType;
  execute: (args: any, config?: any) => Promise<any>;
  category?: string;
  abstractionLevel?: "atomic" | "orchestration";
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.list().filter(t => t.category === category);
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  size(): number {
    return this.tools.size;
  }

  merge(other: ToolRegistry): void {
    for (const tool of other.list()) {
      if (!this.tools.has(tool.name)) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  clear(): void {
    this.tools.clear();
  }
}

export function defineTool(config: ToolDefinition): ToolDefinition {
  return config;
}
