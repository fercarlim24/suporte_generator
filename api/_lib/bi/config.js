export function normalizePrivateKey(raw) {
  let key = String(raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

export function gaConfig(env = process.env) {
  const propertyId = env.GA_PROPERTY_ID?.trim() || '';
  const clientEmail = env.GA_CLIENT_EMAIL?.trim() || '';
  const privateKey = normalizePrivateKey(env.GA_PRIVATE_KEY);
  return {
    configured: Boolean(propertyId && clientEmail && privateKey),
    propertyId: propertyId || null,
    clientEmail: clientEmail || null,
    privateKey: privateKey || null,
  };
}

export function metabaseConfig(env = process.env) {
  const url = env.METABASE_URL?.trim() || '';
  const apiKey = env.METABASE_API_KEY?.trim() || '';
  const databaseId = env.METABASE_DATABASE_ID?.trim() || '';
  return {
    configured: Boolean(url && apiKey),
    databaseId: databaseId || null,
  };
}

export function integrationFlags(env = process.env) {
  return {
    ga4: gaConfig(env).configured,
    metabase: metabaseConfig(env).configured,
  };
}

export function missingRelation(error) {
  const msg = `${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`;
  return /PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(msg);
}
