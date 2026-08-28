import { OpenAICompatBase } from "./openai-compat-base.ts"

export class OpenAIProvider extends OpenAICompatBase {
  constructor() { super("openai") }
}
