import type { DiscordNotificationSecrets } from "../domain/types";

const DISCORD_CONTENT_LIMIT = 1900;

function splitMessage(message: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < message.length; index += DISCORD_CONTENT_LIMIT) {
    chunks.push(message.slice(index, index + DISCORD_CONTENT_LIMIT));
  }

  return chunks.length > 0 ? chunks : [message];
}

export class DiscordNotifier {
  constructor(private readonly secrets: DiscordNotificationSecrets) {}

  async send(message: string): Promise<void> {
    for (const content of splitMessage(message)) {
      const response = await fetch(this.secrets.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] },
        }),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new Error(`Discord 通知に失敗しました: ${response.status} ${responseText}`.trim());
      }
    }
  }
}
