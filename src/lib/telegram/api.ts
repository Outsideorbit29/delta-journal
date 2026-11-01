// Minimal Telegram Bot API client: only the methods and fields the journal bot uses.
// https://core.telegram.org/bots/api

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TgChat {
  id: number;
  /** "private" for a one-to-one chat with the bot; groups and channels are never linked. */
  type?: "private" | "group" | "supergroup" | "channel";
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  voice?: { file_id: string; duration: number; file_size?: number };
  reply_to_message?: TgMessage;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export type ReplyMarkup = { inline_keyboard: InlineButton[][] } | { force_reply: true; input_field_placeholder?: string };

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly description: string,
  ) {
    super(`Telegram ${method} failed (${code}): ${description}`);
  }
}

/** The calls the bot makes. A fake implements this in tests. */
export interface TelegramClient {
  getUpdates(offset: number, timeoutSec: number): Promise<TgUpdate[]>;
  sendMessage(chatId: string, text: string, markup?: ReplyMarkup): Promise<TgMessage>;
  editMessage(chatId: string, messageId: number, text: string, markup?: ReplyMarkup): Promise<void>;
  answerCallback(callbackId: string, text?: string): Promise<void>;
  setCommands(commands: { command: string; description: string }[]): Promise<void>;
  /** Downloads a file the user sent, such as a voice note. */
  downloadFile(fileId: string): Promise<Uint8Array>;
}

export class TelegramApi implements TelegramClient {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await res.json().catch(() => null)) as { ok: boolean; result?: T; error_code?: number; description?: string } | null;
    if (!data?.ok) throw new TelegramError(method, data?.error_code ?? res.status, data?.description ?? res.statusText);
    return data.result as T;
  }

  getUpdates(offset: number, timeoutSec: number) {
    // Allow the HTTP request a little longer than Telegram's long-poll timeout.
    return this.call<TgUpdate[]>(
      "getUpdates",
      { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
      AbortSignal.timeout((timeoutSec + 15) * 1000),
    );
  }

  sendMessage(chatId: string, text: string, markup?: ReplyMarkup) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: markup,
    });
  }

  async editMessage(chatId: string, messageId: number, text: string, markup?: ReplyMarkup) {
    try {
      await this.call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: markup });
    } catch (err) {
      // Tapping a button that leaves the message unchanged is not an error.
      if (!(err instanceof TelegramError && err.description.includes("message is not modified"))) throw err;
    }
  }

  async answerCallback(callbackId: string, text?: string) {
    await this.call("answerCallbackQuery", { callback_query_id: callbackId, text });
  }

  async setCommands(commands: { command: string; description: string }[]) {
    await this.call("setMyCommands", { commands });
  }

  async downloadFile(fileId: string) {
    const file = await this.call<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new TelegramError("getFile", 404, "Telegram returned no file path");
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new TelegramError("downloadFile", res.status, res.statusText);
    return new Uint8Array(await res.arrayBuffer());
  }
}
