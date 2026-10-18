import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { App } from './app';
import { AuthService } from './core/api/auth.service';
import { DemoStore } from './core/demo-store';

describe('App shell', () => {
  const session = signal<{ id: string; name: string; email: string; role: 'ADMIN'; active: boolean; must_change_password: boolean; version: number } | null>(null);

  beforeEach(async () => {
    session.set(null);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
        { provide: AuthService, useValue: { currentUser: session, logout: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('shows the public route without exposing the authenticated workspace', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-sidebar')).toBeNull();
  });

  it('shows the authenticated navigation and current exercise without demo controls', async () => {
    session.set({ id: 'u1', name: 'Administradora', email: 'admin@example.test', role: 'ADMIN', active: true, must_change_password: false, version: 1 });
    TestBed.inject(DemoStore).loaded.set(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('Emendas');
    expect(compiled.querySelector('.year-control')?.textContent).toContain('2026');
    expect(compiled.querySelector('.preview-banner')).toBeNull();
    expect(compiled.textContent).not.toContain('Reiniciar demonstração');
  });
});
