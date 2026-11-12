import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const script = resolve("scripts/setup.mjs");
test("connection import preserves local encryption and server settings without printing secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "hedgeway-setup-"));
  try {
    writeFileSync(
      join(dir, ".env"),
      'TOKEN_ENCRYPTION_KEY="keep-existing-key"\nPORT=4100\nGEMINI_API_KEY=old\n',
    );
    const file = join(dir, "connections.env");
    writeFileSync(
      file,
      "UPSTOX_ACCESS_TOKEN=test-broker-secret\nGEMINI_API_KEY=test-ai-secret\nGEMINI_MODEL=gemini-3.5-flash-lite\nAI_PROVIDER=gemini\nMARKET_PROVIDER=upstox\n",
    );
    const result = spawnSync(process.execPath, [script, file], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const config = parse(readFileSync(join(dir, ".env")));
    expect(config.TOKEN_ENCRYPTION_KEY).toBe("keep-existing-key");
    expect(config.PORT).toBe("4100");
    expect(config.GEMINI_API_KEY).toBe("test-ai-secret");
    expect(result.stdout + result.stderr).not.toContain("test-ai-secret");
    expect(result.stdout + result.stderr).not.toContain("test-broker-secret");
    const before = readFileSync(join(dir, ".env"), "utf8");
    writeFileSync(file, "HOST=0.0.0.0\n");
    expect(
      spawnSync(process.execPath, [script, file], { cwd: dir }).status,
    ).not.toBe(0);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
