import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
const path = ".env";
let content = existsSync(path)
  ? readFileSync(path, "utf8")
  : readFileSync(".env.example", "utf8");
const set = (key, value) => {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content)
    ? content.replace(pattern, () => line)
    : content + "\n" + line + "\n";
};
if (process.argv[2]) {
  const imported = parse(readFileSync(process.argv[2], "utf8"));
  const allowed = [
    "UPSTOX_ACCESS_TOKEN",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "AI_PROVIDER",
    "MARKET_PROVIDER",
  ];
  if (Object.keys(imported).some((key) => !allowed.includes(key)))
    throw new Error(
      "This file contains unsupported configuration fields. Nothing was changed.",
    );
  if (
    !imported.UPSTOX_ACCESS_TOKEN ||
    !imported.GEMINI_API_KEY ||
    imported.AI_PROVIDER !== "gemini" ||
    imported.MARKET_PROVIDER !== "upstox" ||
    !["gemini-3.8-flash", "gemini-3.5-flash-lite"].includes(
      imported.GEMINI_MODEL,
    )
  )
    throw new Error(
      "Expected an Upstox and free-tier Gemini connection file. Nothing was changed.",
    );
  if (Object.values(imported).some((v) => /[\r\n]/.test(v)))
    throw new Error("Invalid connection file. Nothing was changed.");
  for (const [key, value] of Object.entries(imported)) set(key, value);
}
// Preserve the local encryption key: existing database credentials depend on it.
if (!parse(content).TOKEN_ENCRYPTION_KEY)
  set("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
writeFileSync(".env.setup.tmp", content, { mode: 0o600 });
renameSync(".env.setup.tmp", path);
try {
  chmodSync(path, 0o600);
} catch {
  /* Windows uses filesystem ACLs. */
}
console.log(
  process.argv[2]
    ? "Upstox and Gemini connections imported. Your existing database and encryption key were preserved. No secrets were printed."
    : "Local configuration ready. Existing settings preserved. No secrets were printed.",
);
console.log("Next: npm run build, then npm start. Open http://localhost:4100.");
