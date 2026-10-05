import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const FEATURE_EVENTS = ['feature_use', 'page_view', 'error_shown'];
const NOT_SET = new Set(['', '(not set)', '(not provided)']);
const PAGE_LIMIT = 10000;

export class GaRequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GaRequestError';
    this.status = status;
    this.body = body;
  }
}

export function isMissingDimensionError(err) {
  if (!err || err.status !== 400) return false;
  const msg = `${err.message || ''} ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body || '')}`;
  return /dimension|customEvent|not a valid/i.test(msg);
}

export function gaDateRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return { startDate: `${start.getFullYear()}-${month}-${day}`, endDate: 'today' };
}

export function yearMonthToDate(yearMonth) {
  const value = String(yearMonth || '');
  if (!/^\d{6}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
}

export function gaDateToIso(date) {
  const value = String(date || '');
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function cleanDim(value) {
  const text = String(value ?? '').trim();
  return NOT_SET.has(text) ? null : text;
}

export function indexReport(report) {
  const dims = (report?.dimensionHeaders || []).map((header) => header.name);
  const metrics = (report?.metricHeaders || []).map((header) => header.name);
  return (report?.rows || []).map((row) => {
    const dimension = {};
    const metric = {};
    dims.forEach((name, index) => {
      dimension[name] = row.dimensionValues?.[index]?.value ?? '';
    });
    metrics.forEach((name, index) => {
      metric[name] = Number(row.metricValues?.[index]?.value || 0);
    });
    return { dimension, metric };
  });
}

export function mapMauReport(report, productCode = 'OS2') {
  return indexReport(report)
    .map(({ dimension, metric }) => {
      const date_id = yearMonthToDate(dimension.yearMonth);
      if (!date_id) return null;
      return {
        date_id,
        product_code: productCode,
        event_name: 'session_start',
        users: metric.activeUsers || 0,
        sessions: metric.sessions || 0,
        event_count: 0,
      };
    })
    .filter(Boolean);
}

export function mapUsageReport(report, { productCode = 'OS2', useEventNameAsFeature = false } = {}) {
  return indexReport(report)
    .map(({ dimension, metric }) => {
      const date_id = gaDateToIso(dimension.date);
      const event_name = cleanDim(dimension.eventName);
      if (!date_id || !event_name) return null;
      const customFeature = cleanDim(dimension['customEvent:feature_key']);
      return {
        date_id,
        product_code: productCode,
        event_name,
        feature_key: customFeature || (useEventNameAsFeature ? event_name : null),
        tenant_id: cleanDim(dimension['customEvent:tenant_id']),
        users: metric.activeUsers || 0,
        sessions: 0,
        event_count: metric.eventCount || 0,
      };
    })
    .filter(Boolean);
}

export function chunkRows(rows, size = 1000) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

function propertyIdOf(propertyId) {
  const id = String(propertyId || '').replace(/^properties\//, '').trim();
  if (!/^\d+$/.test(id)) throw new GaRequestError('GA_PROPERTY_ID inválido', 0, null);
  return id;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signServiceAccountJwt({ clientEmail, privateKey, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const unsigned = `${base64urlJson({ alg: 'RS256', typ: 'JWT' })}.${base64urlJson({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  })}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

async function fetchAccessToken(cfg, fetchImpl) {
  const assertion = signServiceAccountJwt({
    clientEmail: cfg.clientEmail,
    privateKey: cfg.privateKey,
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || !data.access_token) {
    throw new GaRequestError(data.error_description || data.error || 'Falha ao autenticar no Google', res.status, data);
  }
  return data.access_token;
}

async function runReport(propertyId, token, body, fetchImpl) {
  const res = await fetchImpl(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new GaRequestError(data.error?.message || `GA Data API ${res.status}`, res.status, data);
  }
  return data;
}

async function runReportAll(propertyId, token, body, fetchImpl) {
  let offset = 0;
  let headers = null;
  const rows = [];
  while (true) {
    const page = await runReport(propertyId, token, { ...body, limit: PAGE_LIMIT, offset }, fetchImpl);
    if (!headers) headers = page;
    const pageRows = page.rows || [];
    rows.push(...pageRows);
    offset += pageRows.length;
    const total = Number(page.rowCount || 0);
    if (!pageRows.length || offset >= total) break;
  }
  return {
    dimensionHeaders: headers?.dimensionHeaders || [],
    metricHeaders: headers?.metricHeaders || [],
    rows,
  };
}

function eventFilter() {
  return {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: FEATURE_EVENTS },
    },
  };
}

export async function fetchGaUsage(cfg, { fetchImpl = fetch, now = new Date(), productCode = 'OS2', accessToken = null } = {}) {
  const token = accessToken || (await fetchAccessToken(cfg, fetchImpl));
  const propertyId = propertyIdOf(cfg.propertyId);
  const dateRanges = [gaDateRange(now)];

  const mauReport = await runReportAll(
    propertyId,
    token,
    {
      dateRanges,
      dimensions: [{ name: 'yearMonth' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    },
    fetchImpl,
  );

  let usageReport;
  let featureMode = 'event_name';
  try {
    usageReport = await runReportAll(
      propertyId,
      token,
      {
        dateRanges,
        dimensions: [
          { name: 'date' },
          { name: 'eventName' },
          { name: 'customEvent:feature_key' },
          { name: 'customEvent:tenant_id' },
        ],
        metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
        dimensionFilter: eventFilter(),
      },
      fetchImpl,
    );
    featureMode = 'custom';
  } catch (err) {
    if (!isMissingDimensionError(err)) throw err;
    usageReport = await runReportAll(
      propertyId,
      token,
      {
        dateRanges,
        dimensions: [{ name: 'date' }, { name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
        dimensionFilter: eventFilter(),
      },
      fetchImpl,
    );
  }

  return {
    featureMode,
    rows: [
      ...mapMauReport(mauReport, productCode),
      ...mapUsageReport(usageReport, { productCode, useEventNameAsFeature: featureMode !== 'custom' }),
    ],
  };
}
