import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { openRotatingLog } from "./sim-log";

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

test("sim output is appended to a file under a directory that did not exist", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-log-test-"));
  try {
    const file = path.join(dir, "nested", "sim.log");
    const log = openRotatingLog(file);
    log.write("first\n");
    log.write("second\n");
    log.close();
    await flush();
    assert.equal(readFileSync(file, "utf8"), "first\nsecond\n");
    const again = openRotatingLog(file);
    again.write("third\n");
    again.close();
    await flush();
    assert.equal(readFileSync(file, "utf8"), "first\nsecond\nthird\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the log rotates once and stays bounded", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-log-test-"));
  try {
    const file = path.join(dir, "sim.log");
    const log = openRotatingLog(file, 100);
    for (let i = 0; i < 30; i += 1) log.write(`line ${String(i).padStart(2, "0")}\n`);
    log.close();
    await flush();
    assert.ok(existsSync(`${file}.1`));
    assert.ok(readFileSync(file, "utf8").length <= 100);
    assert.ok(readFileSync(`${file}.1`, "utf8").length <= 100);
    assert.ok(readFileSync(file, "utf8").includes("line 29"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an oversized existing log is rotated on open and an unwritable path never throws", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-log-test-"));
  try {
    const file = path.join(dir, "sim.log");
    writeFileSync(file, "x".repeat(200));
    const log = openRotatingLog(file, 100);
    log.write("fresh\n");
    log.close();
    await flush();
    assert.equal(readFileSync(file, "utf8"), "fresh\n");
    assert.equal(readFileSync(`${file}.1`, "utf8").length, 200);

    // a path whose parent is a regular file cannot be created
    const blocked = openRotatingLog(path.join(file, "child", "sim.log"));
    assert.doesNotThrow(() => blocked.write("ignored\n"));
    blocked.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
