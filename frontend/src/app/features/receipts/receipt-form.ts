import { Component, computed, inject, input, OnInit, signal, ElementRef } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MaskitoDirective } from '@maskito/angular';
import { DemoStore } from '../../core/demo-store';
import { Amendment, Author } from '../../core/models';
import { toCents } from '../../core/money';
import { MoneyInput } from '../../shared/money-input';
import { PT_BR_DATE_MASK } from '../../shared/date-mask';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';

@Component({
  selector: 'app-receipt-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MaskitoDirective,
    TextFieldModule,
    MoneyInput,
  ],
  template: `
    <section class="page form-page">
      <nav class="breadcrumbs" aria-label="Localização">
        <a routerLink="/recebimentos">Recebimentos</a><span>/</span
        ><span>{{ editing() ? 'Corrigir recebimento' : 'Novo recebimento' }}</span>
      </nav>
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ editing() ? 'Corrigir recebimento' : 'Novo recebimento' }}</h1>
          <p class="page-intro">
            {{
              editing()
                ? 'Registre o motivo da correção para manter a rastreabilidade.'
                : 'Identifique a origem e a destinação deste crédito.'
            }}
          </p>
        </div>
        <button mat-stroked-button type="button" (click)="openHelp()">Como preencher?</button>
      </div>
      @if (editing()) {
        <p class="context-note">
          Todos os dados do crédito podem ser corrigidos por um administrador. O motivo é obrigatório
          e a alteração fica registrada no histórico.
        </p>
      }
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) {
          <p class="error-banner" role="alert">{{ error() }}</p>
        }
        <fieldset>
          <legend>Origem do recurso</legend>
          <div class="form-grid">
            <mat-form-field appearance="outline"
              ><mat-label>Parlamentar</mat-label
              ><input
                matInput
                formControlName="author"
                [matAutocomplete]="authorOptions"
                placeholder="Digite para buscar"
                autocomplete="off"
                required
                matTooltip="Selecione quem indicou esta emenda. Se ainda não estiver na lista, cadastre primeiro em Parlamentares."
              />
              @if (form.controls.author.value) {
                <button
                  matSuffix
                  mat-button
                  type="button"
                  (click)="form.controls.author.setValue(null)"
                  aria-label="Limpar parlamentar"
                >
                  Limpar
                </button>
              }
              <mat-autocomplete
                #authorOptions="matAutocomplete"
                [displayWith]="displayAuthor"
                [requireSelection]="true"
              >
                @for (author of filteredAuthors(); track author.id) {
                  <mat-option [value]="author">{{ author.name }}</mat-option>
                }
                @if (!filteredAuthors().length) {
                  <mat-option disabled>Nenhum parlamentar encontrado</mat-option>
                }</mat-autocomplete
              ><mat-error>Selecione um parlamentar da lista.</mat-error>
            </mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>Emenda / proposta</mat-label
              ><input
                matInput
                formControlName="amendment"
                [matAutocomplete]="amendmentOptions"
                placeholder="Digite o número da emenda"
                autocomplete="off"
                required
                matTooltip="Vincule o crédito à proposta correta. Uma emenda pode ter vários objetos, cada um com seu próprio recebimento."
              /><mat-autocomplete
                #amendmentOptions="matAutocomplete"
                [displayWith]="displayAmendment"
                [requireSelection]="true"
              >
                @for (amendment of filteredAmendments(); track amendment.id) {
                  <mat-option [value]="amendment"
                    >{{ amendment.number }} · {{ amendment.year }}</mat-option
                  >
                }
                @if (!filteredAmendments().length) {
                  <mat-option disabled>Nenhuma emenda encontrada</mat-option>
                }</mat-autocomplete
              ><mat-hint>{{
                availableAmendments().length
                  ? 'Selecione a origem deste recebimento.'
                  : 'Selecione o parlamentar. Cadastre emendas em Parlamentares.'
              }}</mat-hint
              ><mat-error>Selecione uma emenda da lista.</mat-error></mat-form-field
            >
          </div>
        </fieldset>
        <fieldset>
          <legend>Destinação</legend>
          <div class="form-grid">
            <mat-form-field appearance="outline"
              ><mat-label>Tipo</mat-label
              ><mat-select formControlName="type" required
                ><mat-option value="Federal">Federal</mat-option
                ><mat-option value="Estadual">Estadual</mat-option></mat-select
              ></mat-form-field
            >
            <mat-form-field appearance="outline"
              ><mat-label>Ação</mat-label
              ><input
                matInput
                formControlName="action"
                maxlength="200"
                placeholder="Código ou nome da ação"
                required
                matTooltip="Informe a ação orçamentária conforme o espelho da emenda."
              /><mat-hint>Código ou descrição da ação aprovada.</mat-hint
              ><mat-error>Informe a ação.</mat-error></mat-form-field
            >
            <mat-form-field appearance="outline"
              ><mat-label>Elemento de despesa</mat-label
              ><input
                matInput
                formControlName="expenseElement"
                maxlength="200"
                placeholder="Código ou descrição do elemento"
                required
                matTooltip="Identifique a classificação da despesa prevista para este recebimento."
              /><mat-hint>Conforme o detalhamento orçamentário.</mat-hint
              ><mat-error>Informe o elemento de despesa.</mat-error></mat-form-field
            >
            <mat-form-field appearance="outline"
              ><mat-label>Fonte de recurso</mat-label
              ><input
                matInput
                formControlName="source"
                maxlength="160"
                placeholder="Código ou descrição da fonte"
                required
                matTooltip="Informe a fonte de recurso identificada no documento da emenda."
              /><mat-hint>Conforme o documento de origem do crédito.</mat-hint
              ><mat-error>Informe a fonte de recurso.</mat-error></mat-form-field
            >
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Objeto do recebimento</mat-label
              ><textarea
                matInput
                formControlName="object"
                cdkTextareaAutosize
                cdkAutosizeMinRows="3"
                cdkAutosizeMaxRows="8"
                maxlength="2000"
                required
                matTooltip="Descreva a destinação aprovada. Cada objeto terá o próprio valor e saldo."
              ></textarea
              ><mat-hint
                >Um objeto por recebimento. Ex.: R$ 100.000 para insumos e R$ 300.000 para locomoção
                são dois registros.</mat-hint
              ><mat-error>Descreva a aplicação deste recurso.</mat-error></mat-form-field
            >
          </div>
        </fieldset>
        <fieldset>
          <legend>Crédito</legend>
          <div class="form-grid">
            <mat-form-field appearance="outline"
              ><mat-label>Data do crédito</mat-label
              ><input
                matInput
                formControlName="date"
                [matDatepicker]="creditCalendar"
                [maskito]="dateMask"
                placeholder="DD/MM/AAAA"
                required
                matTooltip="Use o dia em que o dinheiro entrou na conta."
              /><mat-datepicker-toggle matIconSuffix [for]="creditCalendar" /><mat-datepicker
                #creditCalendar
              /><mat-error>Informe uma data válida em DD/MM/AAAA.</mat-error></mat-form-field
            >
            <mat-form-field appearance="outline"
              ><mat-label>Conta bancária</mat-label
              ><input
                matInput
                formControlName="account"
                maxlength="100"
                placeholder="Ex.: 000124-X"
                required
                matTooltip="Informe a conta que recebeu o crédito conforme o extrato bancário."
              /><mat-hint>Inclua zeros à esquerda e dígito.</mat-hint
              ><mat-error>Informe a conta bancária.</mat-error></mat-form-field
            >
            <app-money-input
              formControlName="amount"
              label="Valor recebido"
              hint="Digite em reais. Ex.: 100000 = R$ 100.000,00. Este valor inicia o saldo deste objeto."
              matTooltip="Informe somente o valor que efetivamente entrou na conta para este objeto."
            />
          </div>
        </fieldset>
        @if (editing()) {
          <fieldset>
            <legend>Justificativa</legend>
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Motivo da correção</mat-label
              ><textarea
                matInput
                formControlName="reason"
                rows="2"
                maxlength="2000"
                required
              ></textarea
              ><mat-error
                >Explique o motivo, com pelo menos 5 caracteres.</mat-error
              ></mat-form-field
            >
          </fieldset>
        }
        <div class="form-actions">
          <a mat-button [routerLink]="editing() ? ['/recebimentos', id()] : ['/recebimentos']"
            >Cancelar</a
          ><button mat-flat-button type="submit" [disabled]="saving()">
            {{ editing() ? 'Salvar correção' : 'Salvar recebimento' }}
          </button>
        </div>
      </form>
    </section>
  `,
  styles: `
    .form-page {
      max-width: 1050px;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0 0 30px;
      min-width: 0;
    }
    legend {
      font-size: 16px;
      font-weight: 500;
      display: block;
      width: 100%;
      padding: 0 0 12px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--app-line);
    }
    .context-note {
      padding: 14px 0;
      color: var(--app-muted);
      margin-bottom: 20px;
      font-size: 13px;
    }
    .breadcrumbs {
      display: flex;
      gap: 8px;
      font-size: 12px;
      margin-bottom: 20px;
      color: var(--app-muted);
    }
    .breadcrumbs a {
      color: inherit;
    }
    .full-width {
      width: 100%;
    }
    textarea {
      resize: none;
    }
  `,
})
export class ReceiptForm implements OnInit {
  readonly store = inject(DemoStore);
  readonly dateMask = PT_BR_DATE_MASK;
  readonly id = input<string>();
  readonly editing = computed(() => !!this.id());
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(MatSnackBar);
  private readonly dialogs = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly form = new FormGroup({
    author: new FormControl<Author | string | null>(null, [Validators.required]),
    amendment: new FormControl<Amendment | string | null>(null, [Validators.required]),
    type: new FormControl<'Federal' | 'Estadual'>('Federal', { nonNullable: true }),
    action: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    expenseElement: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    source: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
    object: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2000)],
    }),
    date: new FormControl<Date | null>(null, [Validators.required]),
    account: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    amount: new FormControl<string | null>(null, [
      Validators.required,
      (control) => {
        if (!control.value) return null;
        try {
          return toCents(String(control.value)) > 0n ? null : { positive: true };
        } catch {
          return { money: true };
        }
      },
    ]),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });
  private readonly authorValue = toSignal(this.form.controls.author.valueChanges, {
    initialValue: this.form.controls.author.value,
  });
  private readonly amendmentValue = toSignal(this.form.controls.amendment.valueChanges, {
    initialValue: this.form.controls.amendment.value,
  });
  readonly filteredAuthors = computed(() => {
    const value = this.authorValue();
    const query = typeof value === 'string' ? value.toLocaleLowerCase('pt-BR') : '';
    return this.store.authors().filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(query));
  });
  readonly availableAmendments = computed(() => {
    const author = this.authorValue();
    return this.store
      .amendments()
      .filter((a) => author && typeof author === 'object' && a.authorId === author.id);
  });
  readonly filteredAmendments = computed(() => {
    const value = this.amendmentValue();
    const query = typeof value === 'string' ? value.toLocaleLowerCase('pt-BR') : '';
    return this.availableAmendments().filter((a) =>
      a.number.toLocaleLowerCase('pt-BR').includes(query),
    );
  });
  readonly displayAuthor = (author: Author | string | null) =>
    typeof author === 'object' && author ? author.name : typeof author === 'string' ? author : '';
  readonly displayAmendment = (value: Amendment | string | null) =>
    typeof value === 'object' && value ? value.number : typeof value === 'string' ? value : '';
  constructor() {
    this.form.controls.author.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.form.controls.amendment.setValue(null, { emitEvent: false });
      if (value && typeof value === 'object') this.form.controls.amendment.enable();
      else this.form.controls.amendment.disable();
    });
    this.form.controls.amendment.disable();
  }
  openHelp(): void {
    this.dialogs.open(WorkflowHelpDialog, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  ngOnInit() {
    const id = this.id();
    if (!id) {
      const amendmentId = this.route.snapshot.queryParamMap.get('emenda');
      const amendment = this.store.amendments().find((a) => a.id === amendmentId);
      if (amendment) {
        this.form.controls.author.setValue(
          this.store.authors().find((a) => a.id === amendment.authorId) ?? null,
        );
        this.form.controls.amendment.setValue(amendment);
        this.form.markAsPristine();
      }
      return;
    }
    const receipt = this.store.receipts().find((r) => r.id === id);
    if (!receipt) {
      void this.router.navigate(['/nao-encontrado']);
      return;
    }
    const author = this.store.receiptAuthor(id) ?? null;
    const [y, m, d] = receipt.creditDate.split('-').map(Number);
    this.form.controls.amendment.enable();
    this.form.patchValue({
      author,
      amendment: this.store.amendments().find((a) => a.id === receipt.amendmentId) ?? null,
      type: receipt.type,
      action: receipt.action,
      expenseElement: receipt.expenseElement ?? '',
      source: receipt.source,
      object: receipt.object,
      date: new Date(y, m - 1, d),
      account: receipt.account,
      amount: receipt.amount,
    });
    this.form.controls.reason.addValidators([Validators.required, Validators.minLength(5)]);
    this.form.controls.reason.updateValueAndValidity();
    this.form.markAsPristine();
  }
  hasUnsavedChanges() {
    return this.form.dirty;
  }
  async save(): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.invalid('Confira os campos destacados. Seu preenchimento foi mantido.');
      return;
    }
    const value = this.form.getRawValue();
    if (
      !value.author ||
      typeof value.author !== 'object' ||
      !value.amendment ||
      typeof value.amendment !== 'object' ||
      !value.date ||
      !value.amount
    ) {
      this.invalid('Selecione a origem e preencha a data e o valor do crédito.');
      return;
    }
    this.saving.set(true);
    try {
      let id = this.id();
      if (id)
        await this.store.correctReceiptBackend(
          id,
          {
            amendmentId: value.amendment.id,
            type: value.type,
            action: value.action.trim(),
            expenseElement: value.expenseElement.trim(),
            source: value.source.trim(),
            object: value.object.trim(),
            account: value.account.trim(),
            creditDate: localIso(value.date),
            amount: value.amount,
          },
          value.reason.trim(),
        );
      else
        id = await this.store.createReceipt({
          amendmentId: value.amendment.id,
          type: value.type,
          action: value.action.trim(),
          expenseElement: value.expenseElement.trim(),
          source: value.source.trim(),
          object: value.object.trim(),
          creditDate: localIso(value.date),
          account: value.account.trim(),
          amount: value.amount,
        });
      this.form.markAsPristine();
      if (value.date.getFullYear() > this.store.year())
        this.store.year.set(value.date.getFullYear());
      this.toast.open(
        this.editing() ? 'Correção salva.' : 'Recebimento salvo.',
        'Fechar',
        { duration: 4500 },
      );
      void this.router.navigate(['/recebimentos', id]);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar. Confira o preenchimento.',
      );
    } finally {
      this.saving.set(false);
    }
  }
  private invalid(message: string) {
    this.error.set(message);
    queueMicrotask(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }
}
function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
