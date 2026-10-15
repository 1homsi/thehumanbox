import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  externalHttpUrl,
  isAllowedRendererPermission,
  isRendererNavigation,
  shouldShowLoadError,
} from "./navigation-guard";

test("only the renderer document can load in the main window", () => {
  const rendererFile = "/Applications/The Human Box.app/Contents/Resources/app/dist/renderer/index.html";
  const allowed = `${pathToFileURL(rendererFile).toString()}?desktop=1&api=http%3A%2F%2F127.0.0.1%3A1`;

  assert.equal(isRendererNavigation(allowed, rendererFile), true);
  assert.equal(isRendererNavigation(pathToFileURL(rendererFile).toString(), rendererFile), true);
  assert.equal(isRendererNavigation("https://example.com", rendererFile), false);
  assert.equal(
    isRendererNavigation("file:///tmp/untrusted.html", rendererFile),
    false,
  );
  assert.equal(isRendererNavigation("not a URL", rendererFile), false);
});

test("only fullscreen and sanitized clipboard writes are allowed for the renderer", () => {
  const rendererFile = "/Applications/The Human Box.app/Contents/Resources/app/dist/renderer/index.html";
  const rendererUrl = pathToFileURL(rendererFile).toString();

  assert.equal(isAllowedRendererPermission("fullscreen", rendererUrl, true, rendererFile), true);
  assert.equal(
    isAllowedRendererPermission("clipboard-sanitized-write", rendererUrl, true, rendererFile),
    true,
  );
  assert.equal(isAllowedRendererPermission("geolocation", rendererUrl, true, rendererFile), false);
  assert.equal(isAllowedRendererPermission("fullscreen", rendererUrl, false, rendererFile), false);
  assert.equal(
    isAllowedRendererPermission("fullscreen", "https://example.com", true, rendererFile),
    false,
  );
});

test("external navigation accepts only valid HTTP and HTTPS URLs", () => {
  assert.equal(externalHttpUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(externalHttpUrl("http://example.com"), "http://example.com/");
  assert.equal(externalHttpUrl("file:///tmp/untrusted.html"), null);
  assert.equal(externalHttpUrl("smb://server/share"), null);
  assert.equal(externalHttpUrl("javascript:alert(1)"), null);
  assert.equal(externalHttpUrl("not a URL"), null);
});

test("only a real main-frame load failure shows the boot error page", () => {
  const url = "file:///app/renderer/index.html";
  assert.equal(shouldShowLoadError(-105, url, true), true);
  // the bundled index.html is missing
  assert.equal(shouldShowLoadError(-6, url, true), true);
  // superseded by a newer navigation
  assert.equal(shouldShowLoadError(-3, url, true), false);
  // sub-frame / iframe failures must not replace the app
  assert.equal(shouldShowLoadError(-105, "https://example.com", false), false);
  // the error page itself failing must not loop
  assert.equal(shouldShowLoadError(-2, "data:text/html;charset=utf-8,x", true), false);
});
