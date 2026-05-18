import { describe, it, expect } from 'vitest';
import {
  REPORT_DEFINITIONS,
  ALL_REPORTS_HUB_ID,
  DELIVERIES_SECTION_ID,
  getReportDefinition,
  tryGetReportDefinition,
  buildReportRouteMap,
  buildReportSectionTitles,
} from '../reportCollection';

describe('REPORT_DEFINITIONS', () => {
  it('contains exactly nine reports', () => {
    expect(REPORT_DEFINITIONS).toHaveLength(9);
  });

  it('every definition has at least one column', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(def.columns.length).toBeGreaterThan(0);
    }
  });

  it('column keys are unique within each definition', () => {
    for (const def of REPORT_DEFINITIONS) {
      const keys = def.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('ids are unique', () => {
    const ids = REPORT_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getReportDefinition', () => {
  it('returns the matching definition by id', () => {
    expect(getReportDefinition('revenue').title).toBe('Revenue');
  });

  it('throws on unknown id', () => {
    expect(() => getReportDefinition('does-not-exist')).toThrow();
  });
});

describe('tryGetReportDefinition', () => {
  it('returns null for unknown id', () => {
    expect(tryGetReportDefinition('xxx')).toBeNull();
  });
});

describe('buildReportRouteMap', () => {
  it('includes hub, deliveries, and every report', () => {
    const map = buildReportRouteMap('/practice/foo');
    expect(map[ALL_REPORTS_HUB_ID]).toBe('/practice/foo/reports');
    expect(map[DELIVERIES_SECTION_ID]).toBe('/practice/foo/reports/deliveries');
    for (const def of REPORT_DEFINITIONS) {
      expect(map[def.id]).toBe(`/practice/foo/reports/${def.id}`);
    }
  });
});

describe('buildReportSectionTitles', () => {
  it('returns label entries for every report id plus hub and deliveries', () => {
    const titles = buildReportSectionTitles();
    expect(titles[ALL_REPORTS_HUB_ID]).toBe('All reports');
    expect(titles[DELIVERIES_SECTION_ID]).toBe('Deliveries');
    for (const def of REPORT_DEFINITIONS) {
      expect(titles[def.id]).toBe(def.title);
    }
  });
});
