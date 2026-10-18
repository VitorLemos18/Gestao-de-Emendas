import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/api/auth.service';
import { DemoStore } from '../../core/demo-store';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <main class="access-page">
      <section class="access-shell" aria-label="Acesso ao sistema de emendas">
        <aside class="access-overview" aria-label="Sobre o sistema">
          <div class="brand-lockup">
            <span class="brand-mark" aria-hidden="true">E</span>
            <span>Controle de emendas</span>
          </div>

          <div class="overview-copy">
            <p class="eyebrow">GESTÃO FINANCEIRA</p>
            <h2>Recebimentos, despesas e saldos em acompanhamento.</h2>
            <p>Acesse os registros e acompanhe a execução dos recursos com clareza.</p>
          </div>

          <div class="access-note">
            <span class="note-mark" aria-hidden="true"></span>
            <span>Acesso restrito a usuários autorizados</span>
          </div>
        </aside>

        <section class="login-panel" aria-labelledby="login-title">
          <header class="login-heading">
            <p class="eyebrow">ÁREA DE ACESSO</p>
            <h1 id="login-title">Entrar na sua conta</h1>
            <p class="intro">Use o e-mail e a senha cadastrados pelo administrador.</p>
          </header>

          @if (route.snapshot.queryParamMap.get('senhaAlterada')) {
            <p class="notice" role="status">Senha alterada. Entre novamente com a nova senha.</p>
          }
          @if (route.snapshot.queryParamMap.get('erro') === 'conexao') {
            <p class="error" role="alert">Não foi possível conectar ao sistema. Confira se o serviço está disponível e tente novamente.</p>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" inputmode="email" required />
              <mat-error>Informe um e-mail válido.</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Senha</mat-label>
              <input matInput [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" required />
              <button
                mat-button
                matSuffix
                type="button"
                class="password-toggle"
                [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'"
                [attr.aria-pressed]="showPassword()"
                (mousedown)="$event.preventDefault()"
                (click)="showPassword.update(visible => !visible)">
                {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
              </button>
              <mat-error>Informe sua senha.</mat-error>
            </mat-form-field>

            <button mat-flat-button type="submit" class="submit-button" [disabled]="saving()">
              {{ saving() ? 'Entrando…' : 'Entrar' }}
            </button>
          </form>

          <p class="recovery-help">
            Precisa redefinir sua senha? Solicite ao administrador do sistema.
          </p>
        </section>
      </section>
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100dvh; background:var(--app-background); }
    .access-page { display:grid; min-height:100dvh; place-items:center; padding:32px; }
    .access-shell { display:grid; grid-template-columns:minmax(0, .92fr) minmax(0, 1.08fr); width:min(100%, 920px); min-height:520px; overflow:hidden; background:var(--app-surface); border:1px solid var(--app-line); border-radius:8px; box-shadow:0 12px 36px #17344a12; }
    .access-overview { display:flex; flex-direction:column; justify-content:space-between; padding:38px 36px 32px; color:#fff; background:#234d73; }
    .brand-lockup { display:flex; align-items:center; gap:11px; font-size:15px; font-weight:500; letter-spacing:.005em; }
    .brand-mark { display:grid; width:34px; height:34px; place-items:center; border:1px solid #ffffff66; border-radius:5px; font-size:17px; font-weight:600; }
    .overview-copy { max-width:360px; padding:38px 0; }
    .eyebrow { margin:0 0 12px; font-size:10px; font-weight:600; letter-spacing:.11em; }
    .overview-copy .eyebrow { color:#d4e0ea; }
    .overview-copy h2 { max-width:340px; margin:0 0 15px; font-size:27px; font-weight:500; line-height:1.28; letter-spacing:-.025em; }
    .overview-copy > p:last-child { max-width:330px; margin:0; color:#e0e9f0; font-size:13px; line-height:1.65; }
    .access-note { display:flex; align-items:center; gap:10px; color:#e0e9f0; font-size:11px; }
    .note-mark { width:7px; height:7px; border-radius:50%; background:#a9c9b8; }
    .login-panel { display:flex; flex-direction:column; justify-content:center; padding:52px clamp(32px, 6vw, 64px); }
    .login-heading { margin-bottom:27px; }
    .login-heading .eyebrow { margin-bottom:9px; color:var(--app-primary); }
    h1 { margin:0; font-size:26px; font-weight:500; line-height:1.25; letter-spacing:-.025em; }
    .intro { margin:9px 0 0; color:var(--app-muted); font-size:13px; line-height:1.55; }
    form { display:grid; gap:6px; }
    .full-width { width:100%; }
    .password-toggle { min-width:62px; padding-inline:8px; color:var(--app-primary); font-size:12px; }
    .submit-button { width:100%; min-height:46px; margin-top:6px; }
    .error,.notice { padding:11px 13px; border-radius:4px; margin:0 0 17px; font-size:12px; line-height:1.5; }
    .error { color:#922d25; background:#fbefed; }
    .notice { color:#285d44; background:#edf6f0; }
    .recovery-help { margin:23px 0 0; padding-top:17px; border-top:1px solid var(--app-line); color:var(--app-muted); font-size:11px; line-height:1.55; }
    @media(max-width:700px) {
      .access-page { place-items:start center; padding:16px; }
      .access-shell { grid-template-columns:minmax(0, 1fr); width:min(100%, 480px); min-height:0; }
      .access-overview { gap:14px; padding:18px 20px 16px; }
      .brand-mark { width:30px; height:30px; }
      .overview-copy { padding:0; }
      .overview-copy .eyebrow { margin-bottom:7px; }
      .overview-copy h2 { margin-bottom:0; font-size:18px; }
      .overview-copy > p:last-child,.access-note { display:none; }
      .login-panel { padding:23px 24px 22px; }
      .login-heading { margin-bottom:17px; }
      h1 { font-size:23px; }
      .intro { margin-top:6px; }
      .recovery-help { margin-top:14px; padding-top:11px; }
    }
    @media(max-width:360px) { .access-page { padding:10px; } .access-overview,.login-panel { padding-inline:18px; } }
    @media(prefers-reduced-motion:reduce) { *,*::before,*::after { transition-duration:.01ms !important; } }
  `],
})
export class LoginPage {
  readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly showPassword = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  async submit(): Promise<void> {
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const user = await this.auth.login(value.email.trim(), value.password);
      if (user.must_change_password) {
        await this.router.navigateByUrl('/trocar-senha');
        return;
      }
      await this.store.loadBackend(user);
      const requested = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/recebimentos';
      const destination = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/recebimentos';
      await this.router.navigateByUrl(destination);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível entrar. Confira seus dados e tente novamente.');
    } finally {
      this.saving.set(false);
    }
  }
}
