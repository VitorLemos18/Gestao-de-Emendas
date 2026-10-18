import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoStore } from '../../core/demo-store';
import { toCents } from '../../core/money';
import { DashboardPage } from './dashboard-page';

describe('DashboardPage', () => {
  let page: DashboardPage;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    queryParams = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        DemoStore,
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParams, snapshot: { queryParamMap: queryParams.value } },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    page = TestBed.runInInjectionContext(() => new DashboardPage());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('apresenta caixa anual, execução acumulada e valores mensais coerentes', () => {
    expect(page.annualSummary()).toEqual({
      opening: '310000.00',
      received: '580000.00',
      paid: '170000.00',
      reversed: '0.00',
      closing: '720000.00',
    });
    expect(page.cumulativeTotals()).toMatchObject({
      received: '950000.00',
      committed: '280000.00',
      liquidated: '255000.00',
      paid: '230000.00',
      toCommit: '670000.00',
      toLiquidate: '25000.00',
      toPay: '25000.00',
    });
    expect(page.overallExecution().label).toBe('24,2%');
    expect(page.objectRows()).toHaveLength(6);
    expect(page.monthlyRows().find((row) => row.name === 'Abril')).toMatchObject({
      received: '80000.00',
      paid: '40000.00',
      reversed: '0.00',
    });
    expect(
      page.monthlyRows().reduce((total, row) => total + toCents(row.received), 0n),
    ).toBe(toCents(page.annualSummary().received));
    expect(page.recentRows()[0]).toMatchObject({ stage: 'Liquidação', date: '2026-10-10' });
  });

  it('recalcula os indicadores e o detalhamento ao filtrar um parlamentar', () => {
    queryParams.next(convertToParamMap({ parlamentar: 'yan' }));

    expect(page.selectedAuthor()?.name).toBe('Yandra Moura');
    expect(page.annualSummary().closing).toBe('140000.00');
    expect(page.cumulativeTotals()).toMatchObject({
      received: '230000.00',
      committed: '90000.00',
      liquidated: '90000.00',
      paid: '90000.00',
    });
    expect(page.overallExecution().label).toBe('39,1%');
    expect(page.objectRows()).toHaveLength(2);
    expect(page.authorRows().map((row) => row.name)).toEqual(['Yandra Moura']);
  });
});
