// k6 baseline smoke + ramp test for Modrek Plus.
// Run externally (not inside Lovable):
//   BASE_URL=https://modrek-plus.lovable.app k6 run load-tests/k6-baseline.js
//
// Scenarios:
//  - smoke: 1 VU x 1m, sanity check
//  - ramp:  0 -> 200 VUs over 5m, hold 5m, cool down
//
// Thresholds are conservative; tune per launch requirements.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://modrek-plus.lovable.app';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m10s',
      tags: { scenario: 'ramp' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);
  check(res, {
    'status 200': (r) => r.status === 200,
    'has html':   (r) => (r.body || '').includes('<div id="root"'),
  });
  sleep(1);
}
