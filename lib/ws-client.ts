"use client";

import { parseServerMessage, type AvatarSeed, type ClientMessage, type ServerMessage } from "@klaeff/protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type Handler<T extends ServerMessage["type"]> = (message: Extract<ServerMessage, { type: T }>) => void;

function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

/**
 * Duenner Wrapper um WebSocket: Handshake (HELLO/RECONNECT), typisiertes
 * Senden/Empfangen ueber das Zod-Protokoll, automatischer Reconnect mit
 * Backoff, und Reconnect bei Tab-Wechsel (iOS friert Hintergrund-Tabs ein).
 */
export class KlaeffClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private playerId: string | null = null;
  private sessionToken: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosedByUser = false;
  private helloPayload: { deviceUuid: string; nickname: string; avatar: AvatarSeed } | null = null;

  private readonly handlers = new Map<string, Set<(message: ServerMessage) => void>>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.ensureConnected();
        }
      });
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  on<T extends ServerMessage["type"]>(type: T, handler: Handler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const set = this.handlers.get(type)!;
    const wrapped = handler as (message: ServerMessage) => void;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  connect(deviceUuid: string, nickname: string, avatar: AvatarSeed): void {
    this.helloPayload = { deviceUuid, nickname, avatar };
    this.manuallyClosedByUser = false;
    this.openSocket();
  }

  disconnect(): void {
    this.manuallyClosedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private ensureConnected(): void {
    if (this.manuallyClosedByUser || !this.helloPayload) {
      return;
    }
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.openSocket();
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private openSocket(): void {
    this.setStatus(this.playerId ? "reconnecting" : "connecting");
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      if (this.playerId && this.sessionToken) {
        this.send({ type: "RECONNECT", sessionToken: this.sessionToken, playerId: this.playerId });
      } else if (this.helloPayload) {
        this.send({ type: "HELLO", ...this.helloPayload });
      }
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      let parsed: ServerMessage;
      try {
        parsed = parseServerMessage(JSON.parse(event.data));
      } catch {
        return;
      }
      if (parsed.type === "WELCOME") {
        this.playerId = parsed.playerId;
        this.sessionToken = parsed.sessionToken;
        this.setStatus("connected");
      }
      if (parsed.type === "HEARTBEAT_PING") {
        this.send({ type: "HEARTBEAT_PONG" });
      }
      const set = this.handlers.get(parsed.type);
      if (set) {
        for (const handler of set) {
          handler(parsed);
        }
      }
    });

    ws.addEventListener("close", () => {
      if (this.manuallyClosedByUser) {
        this.setStatus("disconnected");
        return;
      }
      this.setStatus("reconnecting");
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 8000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }
}

let singleton: KlaeffClient | null = null;

export function getKlaeffClient(): KlaeffClient {
  if (!singleton) {
    singleton = new KlaeffClient();
  }
  return singleton;
}
