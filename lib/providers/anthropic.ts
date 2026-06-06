import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message } from "./base";

const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async chat(messages: Message[], systemPrompt: string): Promise<ReadableStream> {
    const stream = this.client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      },
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [text], model: "voyage-3" }),
    });
    if (!response.ok) {
      throw new Error(`Voyage embed failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data[0].embedding as number[];
  }
}
