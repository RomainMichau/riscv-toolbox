// Cards and the groups inside them fold the same way: everything but the first
// one starts closed, and the user's own choices win and are kept in the browser
// under a key of its own.

import { useState } from "preact/hooks";

// Every toolbox built on this framework is served as its own GitHub Pages
// project site, but they all share one origin (romainmichau.github.io) —
// and localStorage is scoped per origin, not per path. A fixed key here
// would let one toolbox's fold state leak into another's wherever they
// happen to reuse a tool id. Keying off the deployed path keeps each site's
// state to itself without every consumer having to configure anything.
const STORE_KEY = "isa.collapsed." + (typeof location !== "undefined" ? location.pathname.split("/")[1] || "" : "");

// A stored entry is true when the fold is *closed*: the default is open, so
// only the folds a reader actually shut need remembering.
let folds = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(folds));
  } catch {
    /* private mode, storage full: the UI still works, it just forgets */
  }
}

// useFold gives a fold its open state, the toggle to flip it, and a way to
// force it open from outside — a card another card sends something to should
// open up to show it, even if the reader had folded it shut.
export function useFold(key, closedByDefault) {
  const [open, setOpen] = useState(() => !(key in folds ? Boolean(folds[key]) : closedByDefault));
  const toggle = () => {
    setOpen((wasOpen) => {
      folds[key] = wasOpen; // it is closed from now on if it was open
      save();
      return !wasOpen;
    });
  };
  const show = () => {
    folds[key] = false;
    save();
    setOpen(true);
  };
  return [open, toggle, show];
}
