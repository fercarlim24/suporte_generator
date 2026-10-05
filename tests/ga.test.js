import { describe, expect, it } from 'vitest';
import { checkApiKey } from '../api/_lib/auth.js';
import { gaConfig, normalizePrivateKey } from '../api/_lib/bi/config.js';
import { fetchGaUsage, gaDateRange, mapMauReport, mapUsageReport } from '../api/_lib/bi/ga.js';
import { toUsageRecords } from '../src/lib/bi/facts.js';

const mauReport = {
  dimensionHeaders: [{ name: 'yearMonth' }],
  metricHeaders: [{ name: 'activeUsers' }, { name: 'sessions' }],
  rows: [
    {
      dimensionValues: [{ value: '202603' }],
      metricValues: [{ value: '80' }, { value: '210' }],
    },
    {
      dimensionValues: [{ value: 'bad' }],
      metricValues: [{ value: '1' }, { value: '1' }],
    },
  ],
};

const usageReport = {
  dimensionHeaders: [
    { name: 'date' },
    { name: 'eventName' },
    { name: 'customEvent:feature_key' },
    { name: 'customEvent:tenant_id' },
  ],
  metricHeaders: [{ name: 'eventCount' }, { name: 'activeUsers' }],
  rows: [
    {
      dimensionValues: [{ value: '20260302' }, { value: 'feature_use' }, { value: 'recibo.download' }, { value: 'acme' }],
      metricValues: [{ value: '40' }, { value: '12' }],
    },
    {
      dimensionValues: [{ value: '20260302' }, { value: 'page_view' }, { value: '(not set)' }, { value: '(not set)' }],
      metricValues: [{ value: '3' }, { value: '2' }],
    },
  ],
};

describe('GA report mapping', () => {
  it('stores monthly active users as one session_start row', () => {
    const [row] = toUsageRecords(mapMauReport(mauReport));
    expect(mapMauReport(mauReport)).toHaveLength(1);
    expect(row.usage_grain).toBe('2026-03-01|OS2|session_start||');
    expect(row.users).toBe(80);
    expect(row.sessions).toBe(210);
    expect(row.event_count).toBe(0);
  });

  it('keeps feature_key and drops sessions on usage rows', () => {
    const [feature, unmapped] = toUsageRecords(mapUsageReport(usageReport));
    expect(feature.usage_grain).toBe('2026-03-02|OS2|feature_use|recibo.download|acme');
    expect(feature.sessions).toBe(0);
    expect(feature.event_count).toBe(40);
    expect(feature.users).toBe(12);
    expect(unmapped.feature_key).toBeNull();
    expect(unmapped.tenant_id).toBeNull();
  });

  it('uses the event name when the property has no feature_key', () => {
    const report = {
      dimensionHeaders: [{ name: 'date' }, { name: 'eventName' }],
      metricHeaders: [{ name: 'eventCount' }, { name: 'activeUsers' }],
      rows: [
        {
          dimensionValues: [{ value: '20260304' }, { value: 'page_view' }],
          metricValues: [{ value: '9' }, { value: '4' }],
        },
      ],
    };
    const [row] = toUsageRecords(mapUsageReport(report, { useEventNameAsFeature: true }));
    expect(row.feature_key).toBe('page_view');
    expect(row.event_name).toBe('page_view');
    expect(row.sessions).toBe(0);
    expect(row.usage_grain).toBe('2026-03-04|OS2|page_view|page_view|');
  });

  it('asks for the last six months', () => {
    expect(gaDateRange(new Date(2026, 9, 2))).toEqual({ startDate: '2026-05-01', endDate: 'today' });
  });

  it('normalizes escaped newlines in the service account key', () => {
    expect(normalizePrivateKey('"line1\\nline2"')).toBe('line1\nline2');
    const cfg = gaConfig({
      GA_PROPERTY_ID: '123',
      GA_CLIENT_EMAIL: 'a@b.c',
      GA_PRIVATE_KEY: 'line1\\nline2',
    });
    expect(cfg.configured).toBe(true);
    expect(cfg.clientEmail).toBe('a@b.c');
    expect(cfg.privateKey).toBe('line1\nline2');
  });
});

describe('GA fetch fallback', () => {
  it('continues with event names when custom dimensions are rejected', async () => {
    const fetchImpl = async (url, init) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'token' }) };
      }
      const body = JSON.parse(init.body);
      const names = body.dimensions.map((dimension) => dimension.name);
      if (names.includes('yearMonth')) {
        return { ok: true, status: 200, json: async () => mauReport };
      }
      if (names.includes('customEvent:feature_key')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Field customEvent:feature_key is not a valid dimension' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          dimensionHeaders: [{ name: 'date' }, { name: 'eventName' }],
          metricHeaders: [{ name: 'eventCount' }, { name: 'activeUsers' }],
          rows: [
            {
              dimensionValues: [{ value: '20260304' }, { value: 'error_shown' }],
              metricValues: [{ value: '2' }, { value: '1' }],
            },
          ],
          rowCount: 1,
        }),
      };
    };

    const result = await fetchGaUsage(
      { propertyId: '123', clientEmail: 'a@b.c', privateKey: 'unused' },
      { fetchImpl, accessToken: 'token', now: new Date(2026, 2, 4) },
    );
    expect(result.featureMode).toBe('event_name');
    const records = toUsageRecords(result.rows);
    expect(records.map((row) => row.usage_grain)).toEqual([
      '2026-03-01|OS2|session_start||',
      '2026-03-04|OS2|error_shown|error_shown|',
    ]);
  });
});

describe('cron auth', () => {
  it('accepts the Vercel cron bearer without the reports api key', () => {
    const previous = {
      cron: process.env.CRON_SECRET,
      api: process.env.REPORTS_API_KEY,
    };
    process.env.CRON_SECRET = 'cron-secret';
    delete process.env.REPORTS_API_KEY;
    try {
      expect(checkApiKey({ headers: { authorization: 'Bearer cron-secret' } }).ok).toBe(true);
      expect(checkApiKey({ headers: { 'x-api-key': 'anything' } }).ok).toBe(false);
    } finally {
      if (previous.cron == null) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous.cron;
      if (previous.api == null) delete process.env.REPORTS_API_KEY;
      else process.env.REPORTS_API_KEY = previous.api;
    }
  });
});
