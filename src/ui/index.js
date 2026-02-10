// Barrel module for UI event and routing helpers.
// app.js depends on this single entry to reduce import sprawl.
export { mountResponsiveNav } from "./responsive-nav.js";
export {
  mountCompareEvents,
  mountGlobalSearchEvents,
  mountPredictEvents,
} from "./page-events.js";
export {
  getRouteFromHash,
  isNavLinkActive,
  resolveRouteTarget,
} from "./router-logic.js";
