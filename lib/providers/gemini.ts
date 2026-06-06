import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, Message } from "./base";

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  }

  async chat(messages: Message[], systemPrompt: string): Promise<ReadableStream> {
    const model = this.client.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;
    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      },
    });
  }

  async embed(text: string): Promise<number[]> {
    // @google/generative-ai SDK uses v1beta — text-embedding-004 is v1 only.
    // Call the v1 REST endpoint directly instead.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini embed failed: ${res.status} ${err}`);
    }
    const data = await res.json();
    return data.embedding.values as number[];
  }
}
