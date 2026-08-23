// RISC-V Toolbox: a static page, computing everything in the browser.
// The tool descriptors come from registry.js and the answers from tools/.

import { render } from "preact";
import { html } from "./lib/html.js";
import { TOOLS } from "./registry.js";
import { App } from "./components/App.js";

render(html`<${App} tools=${TOOLS} />`, document.getElementById("tools"));
