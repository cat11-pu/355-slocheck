// slo.js：分桶累加与达标判定
export function bumpOf(buckets, bucket, good) {
  const next = (buckets || []).map(function (row) {
    return [row[0], [row[1][0], row[1][1]]];
  });
  let found = null;
  for (const row of next) {
    if (row[0] === bucket) { found = row; break; }
  }
  if (!found) {
    found = [bucket, [0, 0]];
    next.push(found);
  }
  if (good) { found[1][0] += 1; } else { found[1][1] += 1; }
  next.sort(function (a, b) { return a[0] - b[0]; });
  return next;
}

export function passOf(good, bad, line) {
  return good * 100 >= line * (good + bad);
}
