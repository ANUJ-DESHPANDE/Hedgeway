import { ArrowLeft, ArrowRight, FileCheck, Upload } from "lucide-react";
import { useState } from "react";
import { money, number, post } from "../api";
import type { Holding } from "../types";
import { Modal } from "../ui";
type Preview = { holdings: Holding[]; added: number; updated: number };
export default function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (csv: string) => Promise<void>;
}) {
  const [csv, setCSV] = useState(""),
    [filename, setFilename] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null);
  async function choose(file?: File) {
    if (!file) return;
    setError("");
    setPreview(null);
    if (file.size > 900000) {
      setError("Choose a CSV smaller than 900 KB.");
      return;
    }
    try {
      setCSV(await file.text());
      setFilename(file.name);
    } catch {
      setError("This file could not be read. Choose it again.");
    }
  }
  return (
    <Modal
      title={preview ? "Review your holdings" : "Import portfolio holdings"}
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="step-caption">
          {preview
            ? "Step 2 of 2 · Review & save"
            : "Step 1 of 2 · Choose your file"}
        </p>
        {preview ? (
          <>
            <div className="import-summary">
              <FileCheck size={24} />
              <div>
                <strong>{preview.holdings.length} holdings ready</strong>
                <p>
                  {preview.added} new · {preview.updated} existing holdings will
                  be updated
                </p>
              </div>
            </div>
            <p>
              Holdings outside this file stay unchanged. Prices are fetched
              separately from your connected market provider.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Quantity</th>
                    <th>Average cost</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.holdings.slice(0, 10).map((h) => (
                    <tr key={`${h.exchange}:${h.symbol}`}>
                      <td>
                        {h.symbol}
                        <small>{h.exchange}</small>
                      </td>
                      <td>{number(h.quantity)}</td>
                      <td>{money(h.averagePrice, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.holdings.length > 10 && (
              <p className="subtle">
                Showing the first 10 of {preview.holdings.length} validated
                holdings.
              </p>
            )}
            <div className="button-row">
              <button disabled={busy} onClick={() => setPreview(null)}>
                <ArrowLeft size={15} />
                Change file
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onImport(csv);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Saving…"
                  : `Import ${preview.holdings.length} holdings`}
                <ArrowRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Download a holdings CSV from your broker and choose it below.
              You’ll see a preview before anything is saved.
            </p>
            <label className="file-input upload-choice">
              <Upload size={22} />
              <span>
                {filename || "Choose holdings CSV"}
                <small>
                  {filename
                    ? "Choose a different file"
                    : "Kite exports and standard CSV files · up to 900 KB"}
                </small>
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => void choose(e.target.files?.[0])}
              />
            </label>
            <details className="disclosure compact">
              <summary>Paste CSV or see the required columns</summary>
              <p>
                Required: symbol, quantity, averagePrice. Optional: exchange
                (NSE or BSE), sector. Common Kite columns such as Instrument,
                Qty. and Avg. cost are also accepted.
              </p>
              <a
                className="text-button"
                href="data:text/csv;charset=utf-8,symbol%2Cexchange%2Cquantity%2CaveragePrice%2Csector%0A"
                download="hedgeway-holdings-template.csv"
              >
                Download blank template
              </a>
              <label>
                CSV contents
                <textarea
                  rows={6}
                  value={csv}
                  onChange={(e) => {
                    setCSV(e.target.value);
                    setFilename("Pasted CSV");
                    setError("");
                  }}
                  placeholder="symbol,exchange,quantity,averagePrice,sector"
                />
              </label>
            </details>
            <button
              className="primary"
              disabled={busy || !csv.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setPreview(await post<Preview>("/holdings/preview", { csv }));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Checking file…" : "Review holdings"}
              <ArrowRight size={16} />
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
