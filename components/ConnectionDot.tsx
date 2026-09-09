import type { ConnectionStatus } from "../lib/ws-client";

const COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--lime)",
  connecting: "var(--muted)",
  reconnecting: "#F5C518",
  disconnected: "var(--pink)",
};

const LABEL: Record<ConnectionStatus, string> = {
  connected: "Verbunden",
  connecting: "Verbinde...",
  reconnecting: "Verbindung wird wiederhergestellt",
  disconnected: "Getrennt",
};

export function ConnectionDot({ status }: { readonly status: ConnectionStatus }): React.ReactElement {
  return (
    <span
      role="status"
      aria-label={LABEL[status]}
      title={LABEL[status]}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: COLOR[status],
        border: "2px solid var(--ink)",
      }}
    />
  );
}
