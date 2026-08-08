// Runs every suite in this directory and reports one summary. Each suite is
// a standalone program that prints a line per check and exits non zero if any
// failed, so this only has to spawn them, pass the output through and add up
// what it saw. Suites run one at a time because several of them set
// process.env and replace globalThis.fetch.
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const files = (await readdir(dir))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

if (files.length === 0) {
  console.error("no test files found");
  process.exit(1);
}

// Spawns one suite, echoing its output as it arrives rather than at the end,
// and resolves with the exit code and what the output claimed.
const runOne = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, dir))], {
      stdio: ["inherit", "pipe", "inherit"],
    });

    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
      process.stdout.write(chunk);
    });

    child.on("close", (code) => {
      const count = (re) => (text.match(re) || []).length;
      resolve({
        code,
        passed: count(/^pass {2}/gm),
        failed: count(/^FAIL {2}/gm),
      });
    });
  });

let passed = 0;
let failed = 0;
const broken = [];

for (const file of files) {
  console.log(`=== ${file} ===`);
  const result = await runOne(file);
  passed += result.passed;
  failed += result.failed;
  // A suite can fail without a FAIL line, by throwing before it gets there.
  if (result.code !== 0) broken.push(`${file} (exit ${result.code})`);
  console.log("");
}

const checks = passed + failed;
console.log(
  `${checks} checks in ${files.length} suites, ${failed} failed`,
);

if (broken.length > 0) {
  console.log(`suites that did not finish: ${broken.join(", ")}`);
}

process.exit(failed > 0 || broken.length > 0 ? 1 : 0);
