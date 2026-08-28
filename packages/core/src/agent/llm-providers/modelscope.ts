import { OpenAICompatBase } from "./openai-compat-base.ts"

export class ModelScopeProvider extends OpenAICompatBase {
  constructor() { super("modelscope") }
}
