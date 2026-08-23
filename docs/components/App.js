// The page: one card per tool, grouped by family, in registration order.

import { html } from "../lib/html.js";
import { Card } from "./Card.js";

export function App({ tools }) {
  const out = [];
  let family = null;
  tools.forEach((tool, i) => {
    if (tool.family !== family) {
      family = tool.family;
      out.push(html`<h2 class="family" key=${family}>${family}</h2>`);
    }
    // Everything but the first card starts closed.
    out.push(html`<${Card} key=${tool.id} tool=${tool} closedByDefault=${i > 0} />`);
  });
  return out;
}
