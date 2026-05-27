import { describe, it, expect } from 'vitest';
import {
  parseGoogleSheetsUrl,
  sortSheetTabs,
  pickDefaultSheetName,
  isSummarySheetName,
  buildAppsScriptRequestUrl,
} from '../src/lib/google-sheets.js';

describe('parseGoogleSheetsUrl', () => {
  it('detects Apps Script deployment', () => {
    const p = parseGoogleSheetsUrl(
      'https://script.google.com/macros/s/abc/exec?sheet=Foo',
    );
    expect(p.kind).toBe('appscript');
    expect(p.deploymentUrl).not.toContain('sheet=');
  });

  it('extracts spreadsheet id and gid from edit link', () => {
    const p = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/1abcXYZ/edit#gid=123456',
    );
    expect(p.spreadsheetId).toBe('1abcXYZ');
    expect(p.gid).toBe('123456');
  });
});

describe('sortSheetTabs', () => {
  it('orders months and puts summary last', () => {
    const sorted = sortSheetTabs([
      { name: 'Resumo Anual', gid: '9' },
      { name: 'Março', gid: '2' },
      { name: 'Janeiro', gid: '0' },
      { name: 'Fevereiro', gid: '1' },
    ]);
    expect(sorted.map((s) => s.name)).toEqual([
      'Janeiro',
      'Fevereiro',
      'Março',
      'Resumo Anual',
    ]);
  });
});

describe('pickDefaultSheetName', () => {
  it('skips summary tab', () => {
    expect(
      pickDefaultSheetName([
        { name: 'Resumo', gid: '0' },
        { name: 'Abril', gid: '1' },
      ]),
    ).toBe('Abril');
  });
});

describe('buildAppsScriptRequestUrl', () => {
  it('adds query params', () => {
    const url = buildAppsScriptRequestUrl('https://script.google.com/macros/s/x/exec', {
      action: 'list',
    });
    expect(url).toContain('action=list');
  });
});

describe('isSummarySheetName', () => {
  it('flags annual summary', () => {
    expect(isSummarySheetName('Resumo Anual')).toBe(true);
    expect(isSummarySheetName('Fevereiro')).toBe(false);
  });
});
