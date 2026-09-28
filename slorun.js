// slorun.js：按处理预算处理并留账，收尾时不限预算把账处理完
import { bumpOf, passOf } from "./slo.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isNonNegInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// 事件结构必须是带合法 kind 与 bucket 字段的普通对象。
function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail("E_BAD_EVENT", "事件必须是对象");
  }
  if (event.kind !== "ok" && event.kind !== "bad" && event.kind !== "report") {
    fail("E_BAD_EVENT", "事件 kind 不合法");
  }
  if (!("bucket" in event) || !isNonNegInt(event.bucket)) {
    fail("E_BAD_BUCKET", "桶号必须是非负整数");
  }
}

function cloneState(state) {
  const src = state || {};
  return {
    buckets: (src.buckets || []).map(function (row) {
      return [row[0], [row[1][0], row[1][1]]];
    }),
    verdicts: (src.verdicts || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (event) {
      return { id: event.id, kind: event.kind, bucket: event.bucket };
    }),
    applied: (src.applied || []).slice()
  };
}

function findRow(buckets, bucket) {
  for (const row of buckets) {
    if (row[0] === bucket) return row;
  }
  return null;
}

function hasVerdict(verdicts, bucket) {
  for (const row of verdicts) {
    if (row[0] === bucket) return true;
  }
  return false;
}

// 判定类错误按当前桶表与判定清单判：先查桶在不在，再查空不空，最后查是否已判过。
function applyEvent(state, event, line) {
  if (event.kind === "report") {
    const row = findRow(state.buckets, event.bucket);
    if (!row) {
      fail("E_NO_BUCKET", "桶 " + event.bucket + " 不在桶表");
    }
    const good = row[1][0];
    const bad = row[1][1];
    if (good + bad === 0) {
      fail("E_EMPTY", "桶 " + event.bucket + " 里一笔都没有");
    }
    if (hasVerdict(state.verdicts, event.bucket)) {
      fail("E_DONE", "桶 " + event.bucket + " 已判定过");
    }
    state.verdicts.push([event.bucket, passOf(good, bad, line) ? "pass" : "fail"]);
  } else {
    state.buckets = bumpOf(state.buckets, event.bucket, event.kind === "ok");
  }
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  const line = spec.line;
  const budget = spec.budget == null ? 0 : spec.budget;
  let served = 0;
  let judged = 0;
  const remaining = Math.max(0, budget);

  for (const event of events) {
    validateEvent(event);
    if (event.id != null && state.applied.indexOf(event.id) !== -1) {
      continue;
    }
    if (served >= remaining) {
      state.ledger.push({ id: event.id, kind: event.kind, bucket: event.bucket });
      if (event.id != null) state.applied.push(event.id);
      continue;
    }
    const beforeCount = state.verdicts.length;
    applyEvent(state, event, line);
    served += 1;
    if (event.id != null) state.applied.push(event.id);
    if (state.verdicts.length > beforeCount) judged += 1;
  }

  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (event) { return [event.kind, event.bucket]; }),
    judged,
    judged_bound: events.filter(function (event) {
      return event && event.kind === "report";
    }).length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const line = spec.line;
  let catchup = 0;
  while (state.ledger.length) {
    const event = state.ledger.shift();
    applyEvent(state, event, line);
    catchup += 1;
  }
  return { state, catchup };
}
