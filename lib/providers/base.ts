export type Message = { role: "user" | "assistant"; content: string };

export interface LLMProvider {
  chat(messages: Message[], systemPrompt: string): Promise<ReadableStream>;
  embed(text: string): Promise<number[]>;
}
