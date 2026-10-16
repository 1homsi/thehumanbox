// The renderer URL carries the per-launch command token in its query
// (`?token=...`). Strip the query before a URL is shown or logged.
export function redactUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.replace(/[?#][\s\S]*$/, "");
  }
}

// Load errors name the full URL they failed on (`... loading 'file://...'`),
// so redact every file URL inside a message.
export function redactUrlsInText(text: string): string {
  return text.replace(/\bfile:\/\/[^\s'"]*/g, (url) => redactUrlForDisplay(url));
}
