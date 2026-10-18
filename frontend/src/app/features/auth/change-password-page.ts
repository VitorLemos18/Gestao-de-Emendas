import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/api/auth.service';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <main class="access-page"><section class="access-card" aria-labelledby="password-title">
      <span class="access-brand">Emendas</span><h1 id="password-title">Crie sua senha pessoal</h1>
      <p class="intro">Este é o primeiro acesso. Antes de continuar, escolha uma senha com pelo menos 12 caracteres.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field appearance="outline"><mat-label>Senha temporária</mat-label><input matInput type="password" formControlName="currentPassword" autocomplete="current-password" /><mat-error>Informe a senha temporária.</mat-error></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Nova senha</mat-label><input matInput type="password" formControlName="newPassword" autocomplete="new-password" /><mat-hint>Mínimo de 12 caracteres.</mat-hint><mat-error>A senha deve ter pelo menos 12 caracteres.</mat-error></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Confirme a nova senha</mat-label><input matInput type="password" formControlName="confirmPassword" autocomplete="new-password" /><mat-error>As senhas precisam ser iguais.</mat-error></mat-form-field>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar e continuar' }}</button>
      </form>
    </section></main>
  `,
  styles: [`
    :host { display:block; min-height:100dvh; background:var(--app-background); }
    .access-page { display:grid; min-height:100dvh; place-items:center; padding:24px; }
    .access-card { width:min(100%, 480px); padding:36px; background:var(--app-surface); border:1px solid var(--app-line); border-radius:8px; box-shadow:0 8px 28px #17344a12; }
    .access-brand { color:var(--app-primary); font-weight:650; font-size:20px; text-decoration:none; }
    h1 { margin:28px 0 8px; font-size:25px; font-weight:600; }
    .intro { margin:0 0 24px; color:var(--app-muted); line-height:1.55; }
    form { display:grid; gap:10px; } button { min-height:46px; }
    .error { padding:12px 14px; color:#922d25; background:#fbefed; border-radius:4px; }
    @media(max-width:520px) { .access-page { padding:16px; } .access-card { padding:26px 20px; } }
  `],
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmPassword: ['', Validators.required],
  });
  async submit(): Promise<void> {
    this.error.set('');
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || this.saving()) return;
    if (value.newPassword !== value.confirmPassword) {
      this.form.controls.confirmPassword.setErrors({ mismatch: true });
      this.error.set('A confirmação não corresponde à nova senha.');
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.changePassword(value.currentPassword, value.newPassword);
      await this.router.navigate(['/entrar'], { queryParams: { senhaAlterada: 1 } });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível trocar a senha. Confira a senha temporária.');
    } finally {
      this.saving.set(false);
    }
  }
}
