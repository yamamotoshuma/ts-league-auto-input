import type { LineNotificationSecrets } from "../domain/types";

export class LineNotifier {
  constructor(private readonly secrets: LineNotificationSecrets) {}

  async send(message: string): Promise<void> {
    const response = await fetch(this.secrets.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secrets.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: this.secrets.recipientId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(`LINE 通知に失敗しました: ${response.status} ${responseText}`.trim());
    }
  }
}
