import { describe, expect, it } from 'vitest';
import { weekToDate, weekPhase, CALENDAR_ANCHOR_ISO, LEAGUE_KICKOFF_WEEK } from '../src/sim/calendar.js';

describe('weekToDate', () => {
  it('week 0 maps to the anchor (2 Aug 2026)', () => {
    const d = weekToDate(0);
    expect(d.iso).toBe(CALENDAR_ANCHOR_ISO);
    expect(d.year).toBe(2026);
    expect(d.month).toBe(8);
    expect(d.day).toBe(2);
  });

  it('week 5 maps to the league kickoff (6 Sep 2026, Sunday)', () => {
    const d = weekToDate(LEAGUE_KICKOFF_WEEK);
    expect(d.iso).toBe('2026-09-06');
    expect(d.display).toContain('sep');
    expect(d.display).toContain('2026');
    expect(d.display.toLowerCase()).toMatch(/dom/);
  });

  it('week 22 maps to early 2027 (mid league)', () => {
    const d = weekToDate(22);
    expect(d.year).toBe(2027);
  });

  it('display contains a weekday abbreviation', () => {
    const d = weekToDate(0);
    expect(d.display).toMatch(/^(Sáb|Dom|Lun|Mar|Mié|Jue|Vie)/);
  });
});

describe('weekPhase', () => {
  it('week 0 is pretemporada', () => {
    expect(weekPhase(0)).toBe('pretemporada');
  });

  it('week 4 is still pretemporada (before kickoff at 5)', () => {
    expect(weekPhase(4)).toBe('pretemporada');
  });

  it('week 5 is liga', () => {
    expect(weekPhase(5)).toBe('liga');
  });

  it('week 26 is liga (kickoff + 21)', () => {
    expect(weekPhase(26)).toBe('liga');
  });

  it('week 27 is cierre (after the 22-matchday season)', () => {
    expect(weekPhase(27)).toBe('cierre');
  });
});
