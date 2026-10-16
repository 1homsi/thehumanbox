import assert from "node:assert/strict";
import test from "node:test";
import { redactUrlForDisplay, redactUrlsInText } from "./redact-url";

test("the per-launch token and the api address are not shown or logged", () => {
  const shown = redactUrlForDisplay(
    "file:///Applications/The%20Human%20Box.app/Contents/Resources/renderer/index.html?desktop=1&api=127.0.0.1:4123&token=8f1c2a4e-1111-2222-3333-444455556666",
  );
  assert.equal(shown.includes("token"), false);
  assert.equal(shown.includes("8f1c2a4e"), false);
  assert.equal(shown.includes("127.0.0.1"), false);
  assert.ok(shown.endsWith("/renderer/index.html"));
});

test("a URL without a query is unchanged", () => {
  assert.equal(redactUrlForDisplay("file:///tmp/renderer/index.html"), "file:///tmp/renderer/index.html");
});

test("a value that is not a URL still loses its query", () => {
  assert.equal(redactUrlForDisplay("not a url?token=secret#frag"), "not a url");
});

test("load error messages lose the query of every file URL they name", () => {
  const message =
    "ERR_FILE_NOT_FOUND (-6) loading 'file:///r/renderer/index.html?desktop=1&api=127.0.0.1:4123&token=SECRET'";
  const shown = redactUrlsInText(message);
  assert.equal(shown.includes("SECRET"), false);
  assert.equal(shown, "ERR_FILE_NOT_FOUND (-6) loading 'file:///r/renderer/index.html'");
});

test("a newline cannot hide the query from the fallback path", () => {
  assert.equal(redactUrlForDisplay("x?token=a\nb"), "x");
});
