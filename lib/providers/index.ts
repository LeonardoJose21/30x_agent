import type { LLMProvider } from "./base";

export function getProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "gemini";

  switch (provider) {
    case "anthropic": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AnthropicProvider } = require("./anthropic");
      return new AnthropicProvider() as LLMProvider;
    }
    case "openai": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OpenAIProvider } = require("./openai");
      return new OpenAIProvider() as LLMProvider;
    }
    case "gemini": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GeminiProvider } = require("./gemini");
      return new GeminiProvider() as LLMProvider;
    }
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". Valid values: "anthropic", "openai", "gemini".`
      );
  }
}
