import assert from "node:assert";
import { bumpOf, passOf } from "../slo.js";
import { step, close } from "../slorun.js";
import { render } from "../app.js";

const base = {
  budget: 1, line: 90,
  state: { buckets: [], verdicts: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "ok", bucket: 1 }],
  bad_bucket_code: "E_BAD_BUCKET", empty_code: "E_EMPTY",
  done_code: "E_DONE", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpOf returns a list", () => {
  assert.ok(Array.isArray(bumpOf([], 1, true)));
});

check("passOf returns a boolean", () => {
  assert.strictEqual(typeof passOf(1, 0, 90), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
