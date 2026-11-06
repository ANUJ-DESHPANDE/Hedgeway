export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    throw new Error(
      body.error || body.message || `Request failed (${response.status})`,
    );
  }
  return response.json();
}
export const post = <T = any>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const remove = (path: string) => api(path, { method: "DELETE" });
export const money = (n: number | null | undefined, decimals = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: decimals,
      }).format(n);
export const number = (n: number | null | undefined, digits = 2) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(
        n,
      );
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
export const date = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "Not reported";
export const timestamp = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Kolkata",
      }) + " IST"
    : "Not reported";
