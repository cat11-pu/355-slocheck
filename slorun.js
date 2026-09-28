// slorun.js：按处理预算处理事件，超预算压账，收尾不限预算补齐
import { bumpOf, passOf } from "./slo.js";

const KIND_OK = "ok";
const KIND_BAD = "bad";
const KIND_REPORT = "report";

function code(spec, name, fallback) {
  const key = name + "_code";
  const map = {
    bad_bucket: "E_BAD_BUCKET",
    empty: "E_EMPTY",
    done: "E_DONE",
    no_bucket: "E_NO_BUCKET",
    event_error: "E_BAD_EVENT"
  };
  return spec && Object.prototype.hasOwnProperty.call(spec, key) && spec[key] != null
    ? spec[key] : fallback || map[name];
}

function failure(spec, name) {
  const error = new Error(name);
  error.code = code(spec, name);
  return error;
}

function isNonNegInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function cloneState(state) {
  const src = state || {};
  return {
    buckets: (src.buckets || []).map(function (row) {
      return [row[0], [row[1][0], row[1][1]]];
    }),
    verdicts: (src.verdicts || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (item) { return Object.assign({}, item); }),
    applied: (src.applied || []).slice()
  };
}

function bucketIndex(buckets, bucket) {
  for (let i = 0; i < buckets.length; i += 1) {
    if (buckets[i][0] === bucket) return i;
  }
  return -1;
}

function hasVerdict(verdicts, bucket) {
  return verdicts.some(function (row) { return row[0] === bucket; });
}

// 结构与桶号先校验：事件不是对象 / kind 不合法报 E_BAD_EVENT，桶号不是非负整数报 E_BAD_BUCKET。
function validateEvent(event, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw failure(spec, "event_error");
  }
  if (event.kind !== KIND_OK && event.kind !== KIND_BAD && event.kind !== KIND_REPORT) {
    throw failure(spec, "event_error");
  }
  if (!isNonNegInt(event.bucket)) {
    throw failure(spec, "bad_bucket");
  }
}

function applyEvent(state, event, spec) {
  validateEvent(event, spec);
  const kind = event.kind;
  const bucket = event.bucket;
  if (kind === KIND_OK || kind === KIND_BAD) {
    state.buckets = bumpOf(state.buckets, bucket, kind === KIND_OK);
  } else {
    const idx = bucketIndex(state.buckets, bucket);
    if (idx < 0) {
      throw failure(spec, "no_bucket");
    }
    if (state.buckets[idx][1][0] + state.buckets[idx][1][1] === 0) {
      throw failure(spec, "empty");
    }
    if (hasVerdict(state.verdicts, bucket)) {
      throw failure(spec, "done");
    }
    const counts = state.buckets[idx][1];
    state.verdicts.push([bucket, passOf(counts[0], counts[1], spec.line) ? "pass" : "fail"]);
  }
  if (event.id != null && !state.applied.includes(event.id)) {
    state.applied.push(event.id);
  }
}

function budgetOf(spec) {
  const value = Number(spec && spec.budget);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function step(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  const events = Array.isArray(input.events) ? input.events : [];
  let remaining = budgetOf(input);
  let served = 0;
  let judged = 0;

  for (const event of events) {
    // 重放：已经处理过的事件直接跳过，不花预算、不再判定。
    if (event && event.id != null && state.applied.includes(event.id)) {
      continue;
    }
    if (remaining <= 0) {
      // 预算用尽：事件连着原样载压账，收尾时再校验处理。
      state.ledger.push(Object.assign({}, event));
      continue;
    }
    applyEvent(state, event, input);
    remaining -= 1;
    served += 1;
    if (event && event.kind === KIND_REPORT) judged += 1;
  }

  const ledger = state.ledger.map(function (item) { return [item.kind, item.bucket]; });
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: ledger,
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  let catchup = 0;

  while (state.ledger.length > 0) {
    const event = state.ledger.shift();
    applyEvent(state, event, input);
    catchup += 1;
  }

  return { state: state, catchup: catchup };
}
