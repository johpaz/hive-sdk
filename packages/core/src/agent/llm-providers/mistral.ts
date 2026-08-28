import { OpenAICompatBase } from "./openai-compat-base.ts"

export class MistralProvider extends OpenAICompatBase {
  constructor() { super("mistral") }
}
