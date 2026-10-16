import assert from "node:assert/strict";
import test from "node:test";

import {
  installRendererCsp,
  rendererContentSecurityPolicy,
} from "./renderer-csp";

test("the renderer policy keeps local script and the wasm sim working", () => {
  const policy = rendererContentSecurityPolicy();
  const directive = (name: string): string =>
    policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

  assert.ok(directive("default-src").includes("'self'"));
  assert.ok(directive("script-src").includes("'self'"));
  // The WebAssembly sim compiles modules at runtime.
  assert.ok(directive("script-src").includes("'wasm-unsafe-eval'"));
  assert.equal(directive("script-src").includes("'unsafe-eval'"), false);
  assert.ok(directive("style-src").includes("'unsafe-inline'"));
  assert.ok(directive("img-src").includes("data:"));
  // The renderer opens a websocket and fetches frames from the local sim.
  // config.ts accepts an ?api= override of 127.0.0.1, localhost or [::1].
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.ok(directive("connect-src").includes(`http://${host}:*`), host);
    assert.ok(directive("connect-src").includes(`ws://${host}:*`), host);
  }
  assert.ok(directive("connect-src").includes("https://*.posthog.com"));
  assert.ok(directive("object-src").includes("'none'"));
  assert.ok(directive("frame-ancestors").includes("'none'"));
});

test("installing the policy answers responses with the CSP header", () => {
  const registrations: Array<{ filter: unknown; header: string[] | undefined }> = [];
  const session = {
    webRequest: {
      onHeadersReceived(...args: unknown[]) {
        const listener = args[args.length - 1] as (
          details: { url: string; responseHeaders: Record<string, string[]> },
          callback: (response: { responseHeaders: Record<string, string[]> }) => void,
        ) => void;
        const details = { url: "file:///r/index.html?token=x", responseHeaders: { "X-Test": ["1"] } };
        let header: string[] | undefined;
        listener(details, (response) => {
          header = response.responseHeaders["Content-Security-Policy"];
          assert.deepEqual(response.responseHeaders["X-Test"], ["1"]);
        });
        registrations.push({ filter: args.length > 1 ? args[0] : undefined, header });
      },
    },
  };

  installRendererCsp(session as never);

  assert.equal(registrations.length, 1);
  // No URL filter: the file:// document must not depend on match patterns.
  assert.equal(registrations[0].filter, undefined);
  assert.deepEqual(registrations[0].header, [rendererContentSecurityPolicy()]);
});
