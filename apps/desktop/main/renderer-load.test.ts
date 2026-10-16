import assert from "node:assert/strict";
import test from "node:test";

import { loadRenderer } from "./renderer-load";

test("a failed renderer load keeps its error code and loses the token", async () => {
  const failure = Object.assign(
    new Error(
      "ERR_FILE_NOT_FOUND (-6) loading 'file:///r/index.html?desktop=1&token=SECRET-TOKEN'",
    ),
    { code: "ERR_FILE_NOT_FOUND" },
  );
  const win = {
    loadFile: async () => {
      throw failure;
    },
  };

  await assert.rejects(
    loadRenderer(win as never, "/r/index.html", { token: "SECRET-TOKEN" }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "ERR_FILE_NOT_FOUND");
      assert.equal(error.message.includes("SECRET-TOKEN"), false);
      assert.ok(error.message.includes("ERR_FILE_NOT_FOUND"));
      return true;
    },
  );
});

test("a non-Error renderer load failure loses the token too", async () => {
  const win = {
    loadFile: async () => {
      throw "file:///r/index.html?desktop=1&token=SECRET-TOKEN";
    },
  };

  await assert.rejects(
    loadRenderer(win as never, "/r/index.html", { token: "SECRET-TOKEN" }),
    (error: Error) => {
      assert.equal(String(error).includes("SECRET-TOKEN"), false);
      return true;
    },
  );
});

test("the query reaches loadFile unchanged when the load succeeds", async () => {
  const calls: Array<{ file: string; query?: Record<string, string> }> = [];
  const win = {
    loadFile: async (file: string, options?: { query?: Record<string, string> }) => {
      calls.push({ file, query: options?.query });
    },
  };

  await loadRenderer(win as never, "/r/index.html", {
    desktop: "1",
    token: "SECRET-TOKEN",
  });

  assert.deepEqual(calls, [
    { file: "/r/index.html", query: { desktop: "1", token: "SECRET-TOKEN" } },
  ]);
});
