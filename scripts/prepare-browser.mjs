import { existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const executable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].find((p) => p && existsSync(p));
if (executable) {
  // Verify the runner's browser really launches; never skip browser tests.
  const browser = await chromium.launch({
    executablePath: executable,
    args: ["--no-sandbox"],
  });
  console.log(`Browser ready: ${executable} (${browser.version()})`);
  await browser.close();
  if (process.env.GITHUB_ENV)
    appendFileSync(
      process.env.GITHUB_ENV,
      `PLAYWRIGHT_CHROMIUM_EXECUTABLE=${executable}\n`,
    );
} else {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "install", "--with-deps", "chromium"],
    { stdio: "inherit" },
  );
}
