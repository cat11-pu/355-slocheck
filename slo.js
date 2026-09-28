// slo.js：分桶累加与达标判定
export function bumpOf(buckets, bucket, good) {
  const next = (buckets || []).map(function (row) {
    return [row[0], [row[1][0], row[1][1]]];
  });
  const hit = next.find(function (row) { return row[0] === bucket; });
  if (hit) {
    hit[1][good ? 0 : 1] += 1;
  } else {
    next.push([bucket, good ? [1, 0] : [0, 1]]);
  }
  next.sort(function (a, b) { return a[0] - b[0]; });
  return next;
}

export function passOf(good, bad, line) {
  return good * 100 >= line * (good + bad);
}
