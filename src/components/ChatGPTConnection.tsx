import { useEffect, useState } from "react";
import { api, post } from "../api";
import { Panel } from "../ui";
type Status = {
  connected: boolean;
  inferenceEnabled: boolean;
  reason: string;
  accounts: { clientId: string; label: string; inferenceConsent: boolean }[];
};
export default function ChatGPTConnection() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<Status>("/chatgpt/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  async function connect(clientId?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ url: string }>(
        "/chatgpt/connect",
        clientId ? { clientId } : {},
      );
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Panel
      title="ChatGPT subscription"
      sub="Use the official local-app sign-in; your existing Gemini connection remains available."
    >
      <div className="integration-body">
        <p>
          {status?.connected
            ? "Account connected. Subscription generation is not enabled yet."
            : "Connect your ChatGPT account without creating a paid API key."}
        </p>
        {status?.accounts.map((a) => (
          <div className="chatgpt-account" key={a.clientId}>
            <strong>{a.label}</strong>
            <span>
              {a.inferenceConsent
                ? "Inference consent granted"
                : "Inference consent not granted"}
            </span>
            <button disabled={busy} onClick={() => void connect(a.clientId)}>
              Reauthorize
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setModels(
                    (
                      await post<{ models: typeof models }>("/chatgpt/models", {
                        clientId: a.clientId,
                      })
                    ).models,
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check available models
            </button>
          </div>
        ))}
        {models.length > 0 && (
          <p>
            Available to this account: {models.map((m) => m.name).join(", ")}
          </p>
        )}
        <div className="button-row">
          <button disabled={busy} onClick={() => void connect()}>
            {busy
              ? "Opening sign-in…"
              : status?.connected
                ? "Add ChatGPT account"
                : "Connect with ChatGPT"}
          </button>
          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            ChatGPT usage controls ↗
          </a>
        </div>
        <p className="subtle">
          Included usage is shared with your ChatGPT/Codex allowance.
          Extra-credit access must be off and verified before this app can
          enable generation. This connection currently makes no inference calls.
        </p>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
