import { Component, ViewChild, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { LucideMenu } from '@lucide/angular';
import { map } from 'rxjs';
import { DemoStore } from './core/demo-store';
import { RoleLabelPipe } from './shared/format';
import { AuthService } from './core/api/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatButtonModule,
    MatSelectModule, RoleLabelPipe, LucideMenu],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(DemoStore);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly years = computed(() => {
    const movementYears = [...this.store.liquidations().map(m => m.date), ...this.store.payments().flatMap(m => m.reversal ? [m.date, m.reversal.date] : [m.date])].map(date => Number(date.slice(0, 4)));
    const years = new Set([this.store.year(), ...this.store.receipts().map(r => Number(r.creditDate.slice(0, 4))), ...this.store.expenses().map(e => Number(e.commitmentDate.slice(0, 4))), ...movementYears]);
    return [...years].filter(y => Number.isInteger(y)).sort((a, b) => b - a);
  });
  protected readonly mobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 900px)').pipe(map(result => result.matches)),
    { initialValue: false },
  );
  @ViewChild('drawer') private drawer?: MatSidenav;

  constructor() {
    effect(() => {
      if (!this.auth.currentUser() && this.store.liveMode) this.store.clearBackend();
    });
  }

  protected closeNav(): void {
    if (this.mobile()) void this.drawer?.close();
  }

  protected async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      // A interface ainda encerra localmente se o serviço estiver indisponível.
    } finally {
      this.store.clearBackend();
      await this.router.navigateByUrl('/entrar');
    }
  }
}
