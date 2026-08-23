// htm bound to Preact's hyperscript: JSX-like templates with nothing to
// transpile, so the site stays a folder of files a static host can serve.
import { h } from "preact";
import htm from "htm";

export const html = htm.bind(h);
