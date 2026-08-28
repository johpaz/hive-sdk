import { OpenAICompatBase } from "./openai-compat-base.ts"

export class NvidiaProvider extends OpenAICompatBase {
  constructor() { super("nvidia") }
}
