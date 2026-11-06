import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = ".env";
let content = existsSync(path)
  ? readFileSync(path, "utf8")
  : readFileSync(".env.example", "utf8");
if (!/^TOKEN_ENCRYPTION_KEY=.+$/m.test(content)) {
  const entry = `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`;
  content = /^TOKEN_ENCRYPTION_KEY=.*$/m.test(content)
    ? content.replace(/^TOKEN_ENCRYPTION_KEY=.*$/m, entry)
    : content + "\n" + entry + "\n";
  writeFileSync(path, content, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows ACLs are managed by the operating system. */
  }
  console.log(
    "Created the local configuration and encryption key. No secrets were printed.",
  );
} else console.log("Existing local configuration preserved.");
console.log(
  "Next: npm run build && npm start. Open http://localhost:4100 and connect your data provider in Integrations.",
);
