import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, Router } from '@angular/router';
import { DemoStore } from '../../core/demo-store';
import { AuthService } from '../../core/api/auth.service';
import { DemoUser, Role, ROLE_LABEL } from '../../core/models';
import { RoleLabelPipe } from '../../shared/format';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    RoleLabelPipe,
  ],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Acessos e perfis</h1>
          <p class="page-intro">
            Controle quem pode registrar operações, consultar informações e administrar usuários.
          </p>
        </div>
        @if (store.isAdmin()) {
          <button mat-flat-button type="button" (click)="openUser()">Novo usuário</button>
        }
      </header>
      @if (store.isAdmin()) {
        <p class="muted access-note">
          Cada perfil reúne permissões predefinidas. Desativar um usuário bloqueia o acesso, mas
          preserva os registros e o histórico associados a ele.
        </p>
        <div class="toolbar">
          <mat-form-field appearance="outline" class="search"
            ><mat-label>Buscar usuário</mat-label
            ><input #searchInput matInput [formControl]="search" placeholder="Nome ou e-mail" />
            @if (search.value) {
              <button
                mat-button
                matSuffix
                type="button"
                aria-label="Limpar busca de usuário"
                (click)="search.setValue(''); searchInput.focus()"
              >
                Limpar
              </button>
            }</mat-form-field
          ><mat-form-field appearance="outline"
            ><mat-label>Perfil</mat-label
            ><mat-select [value]="role()" (selectionChange)="setRole($event.value)"
              ><mat-option value="">Todos os perfis</mat-option
              ><mat-option value="ADMIN">Administrador</mat-option
              ><mat-option value="OPERATOR">Operador</mat-option
              ><mat-option value="VIEWER">Consulta</mat-option></mat-select
            ></mat-form-field
          >
        </div>
        <div class="table-wrap">
          <table mat-table [dataSource]="pagedUsers()" class="work-table">
            <ng-container matColumnDef="name"
              ><th mat-header-cell *matHeaderCellDef>Usuário</th>
              <td mat-cell *matCellDef="let user">
                <strong>{{ user.name }}</strong>
                @if (user.id === store.currentUser().id) {
                  <span class="muted"> · você</span>
                }
                <div class="muted">{{ user.email }}</div>
              </td></ng-container
            >
            <ng-container matColumnDef="role"
              ><th mat-header-cell *matHeaderCellDef>Perfil</th>
              <td mat-cell *matCellDef="let user">{{ user.role | roleLabel }}</td></ng-container
            >
            <ng-container matColumnDef="active"
              ><th mat-header-cell *matHeaderCellDef>Situação</th>
              <td mat-cell *matCellDef="let user">
                <span class="status" [class.inactive]="!user.active">{{
                  user.active ? 'Ativo' : 'Inativo'
                }}</span>
              </td></ng-container
            >
            <ng-container matColumnDef="actions"
              ><th mat-header-cell *matHeaderCellDef>Ação</th>
              <td mat-cell *matCellDef="let user">
                <button mat-button type="button" (click)="openUser(user)">Editar acesso</button>
              </td></ng-container
            >
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr *matNoDataRow>
              <td colspan="4" class="empty-state">
                <strong>Nenhum usuário corresponde aos filtros</strong>
                <p>Altere ou limpe a busca e o perfil.</p>
              </td>
            </tr>
          </table>
        </div>
        <mat-paginator
          [length]="visibleUsers().length"
          [pageIndex]="safePage()"
          [pageSize]="pageSize()"
          [pageSizeOptions]="[10, 25, 50]"
          (page)="changePage($event)"
          aria-label="Paginação dos usuários"
        ></mat-paginator>
        <div class="role-guide">
          <div class="section-heading"><h2>Permissões por perfil</h2></div>
          <dl>
            <div>
              <dt>Administrador</dt>
              <dd>Registra operações, exporta Excel e gerencia usuários.</dd>
            </div>
            <div>
              <dt>Operador</dt>
              <dd>Registra operações financeiras e exporta Excel. Não gerencia usuários.</dd>
            </div>
            <div>
              <dt>Consulta</dt>
              <dd>Consulta cadastros, execução, saldos e histórico. Não registra nem exporta.</dd>
            </div>
          </dl>
        </div>
        <p class="muted">
          Mudanças de perfil e situação ficam registradas no histórico. Usuários não podem ser
          excluídos; desative o acesso quando necessário.
        </p>
      } @else {
        <div class="empty-state">
          <h2>Acesso restrito ao Administrador</h2>
          <p>Seu perfil permite consultar as áreas autorizadas.</p>
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .search {
      flex: 1;
      min-width: min(100%, 280px);
    }
    .role-guide {
      margin: 30px 0 24px;
    }
    .access-note {
      max-width: 90ch;
      margin: -4px 0 18px;
      line-height: 1.55;
    }
    .role-guide dl {
      display: grid;
      gap: 14px;
    }
    .role-guide dl > div {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 16px;
    }
    .role-guide dt {
      font-weight: 600;
    }
    .role-guide dd {
      margin: 0;
      color: var(--app-muted);
    }
    .inactive {
      color: var(--app-muted);
      background: var(--app-background);
    }
    @media (max-width: 600px) {
      .role-guide dl > div {
        grid-template-columns: 1fr;
        gap: 4px;
      }
    }
  `,
})
export class UsersPage {
  readonly store = inject(DemoStore);
  private readonly dialogs = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly search = new FormControl(this.route.snapshot.queryParamMap.get('q') ?? '', {
    nonNullable: true,
  });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: this.search.value });
  readonly role = signal<Role | ''>(
    ['ADMIN', 'OPERATOR', 'VIEWER'].includes(this.route.snapshot.queryParamMap.get('perfil') ?? '')
      ? (this.route.snapshot.queryParamMap.get('perfil') as Role)
      : '',
  );
  readonly page = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pagina')) || 0)),
  );
  readonly pageSize = signal(
    [10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limite')))
      ? Number(this.route.snapshot.queryParamMap.get('limite'))
      : 10,
  );
  readonly columns = ['name', 'role', 'active', 'actions'];
  readonly visibleUsers = computed(() =>
    this.store
      .users()
      .filter(
        (user) =>
          (!this.role() || user.role === this.role()) &&
          `${user.name} ${user.email}`
            .toLocaleLowerCase('pt-BR')
            .includes(this.query().toLocaleLowerCase('pt-BR')),
      ),
  );
  readonly safePage = computed(() =>
    Math.min(this.page(), Math.max(0, Math.ceil(this.visibleUsers().length / this.pageSize()) - 1)),
  );
  readonly pagedUsers = computed(() =>
    this.visibleUsers().slice(
      this.safePage() * this.pageSize(),
      (this.safePage() + 1) * this.pageSize(),
    ),
  );
  constructor() {
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.page.set(0);
      this.persist();
    });
  }
  setRole(role: Role | ''): void {
    this.role.set(role);
    this.page.set(0);
    this.persist();
  }
  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.persist();
  }
  private persist(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        perfil: this.role() || null,
        pagina: this.safePage() || null,
        limite: this.pageSize() === 10 ? null : this.pageSize(),
      },
      replaceUrl: true,
    });
  }
  openUser(user?: DemoUser): void {
    if (!this.store.isAdmin()) return;
    this.dialogs
      .open(UserDialog, {
        data: user ?? null,
        width: '680px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((id) => {
        if (id) {
          this.snack.open(user ? 'Acesso alterado.' : 'Usuário cadastrado.', 'Fechar', {
            duration: 5000,
          });
          if (user?.id === this.store.currentUser().id) {
            this.auth.clearSession();
            this.store.clearBackend();
            void this.router.navigateByUrl('/entrar');
          }
        }
      });
  }
}

@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `<h2 mat-dialog-title>{{ user ? 'Alterar acesso' : 'Novo usuário' }}</h2>
    <mat-dialog-content
      ><p class="muted">
        {{
          user
            ? 'Altere o perfil e a situação. Nome e e-mail permanecem como cadastrados.'
            : 'Defina uma senha inicial. No primeiro acesso, a pessoa deverá criar uma senha própria.'
        }}
      </p>
      <form id="user-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) {
          <p class="error-banner" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="full-width"
            ><mat-label>Nome</mat-label
            ><input
              matInput
              formControlName="name"
              [readonly]="!!user"
              maxlength="160"
              required
            /><mat-error>Informe o nome do usuário.</mat-error></mat-form-field
          >
          <mat-form-field appearance="outline" class="full-width"
            ><mat-label>E-mail</mat-label
            ><input
              matInput
              formControlName="email"
              type="email"
              [readonly]="!!user"
              maxlength="254"
              autocomplete="off"
              required
            /><mat-error>Informe um e-mail válido.</mat-error></mat-form-field
          >
          @if (!user) {
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Senha inicial</mat-label
              ><input
                matInput
                type="password"
                formControlName="password"
                autocomplete="new-password"
                required
              /><mat-hint
                >Mínimo de 12 caracteres; a troca será obrigatória no primeiro acesso.</mat-hint
              ><mat-error>Informe uma senha de pelo menos 12 caracteres.</mat-error></mat-form-field
            >
          }
          <mat-form-field appearance="outline"
            ><mat-label>Perfil</mat-label
            ><mat-select formControlName="role"
              ><mat-option value="ADMIN">Administrador</mat-option
              ><mat-option value="OPERATOR">Operador</mat-option
              ><mat-option value="VIEWER">Consulta</mat-option></mat-select
            ></mat-form-field
          >
          <div class="active-field">
            <mat-checkbox formControlName="active">Acesso ativo</mat-checkbox>
          </div>
          @if (user) {
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Motivo da alteração</mat-label
              ><textarea
                matInput
                formControlName="reason"
                rows="3"
                minlength="5"
                maxlength="2000"
                required
                style="resize:none"
              ></textarea
              ><mat-hint>De 5 a 2000 caracteres. O motivo fica no histórico.</mat-hint
              ><mat-error>Descreva o motivo com 5 a 2000 caracteres.</mat-error></mat-form-field
            >
          }
        </div>
        @if (isLastAdmin()) {
          <p class="muted">
            Este é o último administrador ativo. Mantenha esse perfil e o acesso ativo até cadastrar
            outro administrador.
          </p>
        }
        @if (user?.id === store.currentUser().id) {
          <p class="muted">
            Você está alterando o seu próprio acesso. A alteração pode encerrar outras sessões.
          </p>
        }
      </form></mat-dialog-content
    ><mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="cancel()" [disabled]="reviewing()">Cancelar</button
      ><button
        mat-flat-button
        type="submit"
        form="user-form"
        [disabled]="reviewing() || saving() || unchanged()"
      >
        {{ user ? 'Revisar alteração' : 'Salvar usuário' }}
      </button></mat-dialog-actions
    >`,
  styles: `
    .active-field {
      display: flex;
      align-items: center;
      padding-bottom: 20px;
    }
  `,
})
export class UserDialog {
  readonly store = inject(DemoStore);
  readonly user = inject<DemoUser | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserDialog>);
  private readonly dialogs = inject(MatDialog);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly error = signal('');
  readonly reviewing = signal(false);
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: [
      this.user?.name ?? '',
      [Validators.required, Validators.maxLength(160), Validators.pattern(/\S/)],
    ],
    email: [
      this.user?.email ?? '',
      [Validators.required, Validators.email, Validators.maxLength(254)],
    ],
    password: [
      '',
      this.user ? [] : [Validators.required, Validators.minLength(12), Validators.maxLength(128)],
    ],
    role: [this.user?.role ?? ('VIEWER' as Role), Validators.required],
    active: [this.user?.active ?? true],
    reason: [
      '',
      this.user
        ? [
            Validators.required,
            Validators.minLength(5),
            Validators.maxLength(2000),
            Validators.pattern(/\S.{4}/s),
          ]
        : [],
    ],
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly unchanged = computed(
    () =>
      !!this.user &&
      this.value().role === this.user.role &&
      this.value().active === this.user.active,
  );
  readonly isLastAdmin = computed(
    () =>
      this.user?.role === 'ADMIN' &&
      this.user.active &&
      this.store.users().filter((u) => u.role === 'ADMIN' && u.active).length === 1,
  );
  constructor() {
    const destroy = inject(DestroyRef);
    this.ref
      .backdropClick()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => this.cancel());
    this.ref
      .keydownEvents()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe((e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      });
  }
  async save(): Promise<void> {
    if (!this.store.isAdmin() || this.reviewing() || this.saving() || this.unchanged()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Confira os campos destacados. Nenhuma alteração foi salva.');
      this.element.nativeElement
        .querySelector<HTMLElement>('input.ng-invalid,textarea.ng-invalid,mat-select.ng-invalid')
        ?.focus();
      return;
    }
    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      email: value.email.trim(),
      role: value.role,
      active: value.active,
    };
    const commit = async () => {
      this.saving.set(true);
      try {
        this.ref.close(
          await this.store.saveUserBackend(
            input,
            this.user?.id,
            value.reason.trim(),
            value.password,
          ),
        );
      } catch (error) {
        this.error.set(
          error instanceof Error ? error.message : 'Não foi possível salvar o acesso.',
        );
      } finally {
        this.saving.set(false);
      }
    };
    if (!this.user) {
      await commit();
      return;
    }
    this.reviewing.set(true);
    this.dialogs
      .open(ConfirmDialog, {
        data: {
          title: 'Confirmar alteração de acesso?',
          message: `${this.user.name} terá perfil ${ROLE_LABEL[value.role]} e acesso ${value.active ? 'ativo' : 'inativo'}. Motivo: ${value.reason.trim()}`,
          confirmLabel: 'Alterar acesso',
          danger: !value.active || (this.user.role === 'ADMIN' && value.role !== 'ADMIN'),
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        this.reviewing.set(false);
        if (ok) void commit();
      });
  }
  cancel(): void {
    if (this.reviewing()) return;
    if (!this.form.dirty) {
      this.ref.close();
      return;
    }
    this.dialogs
      .open(ConfirmDialog, {
        data: {
          title: 'Descartar alterações?',
          message: 'As alterações deste acesso ainda não foram salvas.',
          confirmLabel: 'Descartar e sair',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.ref.close();
      });
  }
}
