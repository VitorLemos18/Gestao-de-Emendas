import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MaskitoDirective } from '@maskito/angular';
import { DemoStore } from '../../core/demo-store';
import { MoneyInput } from '../../shared/money-input';
import { PT_BR_DATE_MASK } from '../../shared/date-mask';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { formatCnpj, isValidCnpj } from '../../core/cnpj';

function validateOptionalCnpj(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  return !value || isValidCnpj(value) ? null : { cnpj: true };
}

export interface ExecutionDialogData {
  kind: 'commitment' | 'liquidation' | 'payment' | 'reversal';
  receiptId: string;
  expenseId?: string;
  paymentId?: string;
  postingId?: string;
  mode?: 'create' | 'edit';
}
@Component({
  selector: 'app-execution-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MaskitoDirective,
    MoneyInput,
    MoneyPipe,
    DateBrPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <div class="execution-context">
          <strong>{{ receipt()?.object }}</strong
          ><span
            >{{ store.receiptAuthor(data.receiptId)?.name }} · Conta {{ receipt()?.account }}</span
          >
          @if (expense()) {
            <span>{{ expense()?.description }} · {{ expense()?.supplier }}</span>
          }
        </div>
        <section
          class="stage-card"
          [class.cash-stage]="data.kind === 'payment'"
          [class.return-stage]="data.kind === 'reversal'"
        >
          <strong>{{ stageLabel }}</strong>
          <p>{{ stageExplanation }}</p>
          <span>{{ cashEffect }}</span>
        </section>
        @if (error()) {
          <p class="error-banner" role="alert">{{ error() }}</p>
        }
        @if (data.kind === 'reversal') {
          <p class="reversal-context">
            Pagamento de <strong>{{ payment()?.amount | money }}</strong
            >, em {{ payment()?.date | dateBr }} · {{ payment()?.document }}
          </p>
          <p class="muted">
            O estorno é integral. O pagamento original será preservado e o valor retornará ao caixa
            na data informada.
          </p>
        } @else {
          @if (editing) {
            <p class="limit-note">A correção exige justificativa e será revalidada com os demais lançamentos.</p>
          } @else {
            <p class="limit-note">
              {{ limitLabel }}: <strong>{{ limit() | money }}</strong
              ><span class="muted">Considera todos os lançamentos registrados. Saldo e liquidação também serão verificados na data informada.</span>
            </p>
          }
        }
        <div class="form-grid">
          @if (data.kind === 'commitment') {
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Descrição da despesa</mat-label
              ><textarea
                matInput
                formControlName="description"
                rows="2"
                maxlength="500"
                required
              ></textarea
              ><mat-error>Descreva a despesa.</mat-error></mat-form-field
            >
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Fornecedor / credor</mat-label
              ><input matInput formControlName="supplier" maxlength="200" required /><mat-error
                >Informe o fornecedor ou credor.</mat-error
              ></mat-form-field
            >
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>CNPJ do fornecedor</mat-label
              ><input
                matInput
                formControlName="cnpj"
                maxlength="18"
                placeholder="00.000.000/0000-00"
                matTooltip="Identifica o fornecedor no documento fiscal. O campo é opcional e aceita o novo CNPJ alfanumérico."
              /><mat-hint>Opcional · digite os caracteres e a pontuação será aplicada.</mat-hint
              ><mat-error>Confira o CNPJ e os dígitos verificadores.</mat-error></mat-form-field
            >
            <section class="pdf-field full-width" aria-labelledby="commitment-pdf-label">
              <div class="pdf-heading">
                <div>
                  <strong id="commitment-pdf-label">Nota de Empenho em PDF</strong>
                  <p>Anexe o documento oficial para consulta posterior. Limite de 10 MB.</p>
                </div>
                <label class="file-button">
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    aria-label="Selecionar Nota de Empenho em PDF"
                    #pdfInput
                    (change)="selectCommitmentPdf($event)"
                  />
                  Selecionar PDF
                </label>
              </div>
              @if (selectedCommitmentPdf(); as file) {
                <div class="selected-file">
                  <span>{{ file.name }} · {{ fileSize(file.size) }}</span>
                  <button mat-button type="button" (click)="clearCommitmentPdf(pdfInput)">
                    Remover
                  </button>
                </div>
              } @else {
                @if (editing && expense()?.commitmentDocument; as document) {
                  <span class="pdf-empty">PDF atual: {{ document.fileName }} · anexe outro para substituí-lo.</span>
                } @else {
                  <span class="pdf-empty">Nenhum arquivo selecionado</span>
                }
              }
              @if (documentError()) {
                <p class="pdf-error" role="alert">{{ documentError() }}</p>
              }
            </section>
          }
          <mat-form-field appearance="outline"
            ><mat-label>{{
              data.kind === 'reversal' ? 'Data do estorno' : 'Data do lançamento'
            }}</mat-label
            ><input
              matInput
              [matDatepicker]="calendar"
              formControlName="date"
              [maskito]="dateMask"
              placeholder="DD/MM/AAAA"
              required
              [matTooltip]="dateHint"
            /><mat-datepicker-toggle matIconSuffix [for]="calendar" /><mat-datepicker
              #calendar
            /><mat-hint>{{ dateHint }}</mat-hint
            ><mat-error>Informe uma data válida em DD/MM/AAAA.</mat-error></mat-form-field
          >
          @if (data.kind !== 'reversal') {
            <app-money-input
              formControlName="amount"
              label="Valor do lançamento"
              hint="Informe em reais. Ex.: 20000 = R$ 20.000,00."
              [matTooltip]="amountTooltip"
            />
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>{{
                data.kind === 'commitment'
                  ? 'Número da Nota de Empenho'
                  : data.kind === 'liquidation'
                    ? 'Documento da liquidação'
                    : 'Número do Ofício'
              }}</mat-label
              ><input
                matInput
                formControlName="document"
                maxlength="100"
                placeholder="Número ou referência"
                required
                matTooltip="Use o número do documento oficial para localizar e conferir este lançamento depois."
              /><mat-hint>Informe o número do documento que comprova esta etapa.</mat-hint
              ><mat-error>Informe o documento.</mat-error></mat-form-field
            >
            @if (data.kind === 'liquidation' || data.kind === 'payment') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Conta de destino</mat-label>
                <input
                  matInput
                  formControlName="destinationAccount"
                  maxlength="100"
                  placeholder="Conta que consta no documento bancário"
                  [readonly]="destinationAccountReadonly()"
                  matTooltip="Esta é a conta que receberá o recurso. Confira com o documento da liquidação."
                />
                <mat-hint>
                  @if (data.kind === 'liquidation') {
                    Informe a conta que receberá o pagamento. Pagamentos parciais usarão esta mesma conta.
                  } @else if (registeredDestinationAccount()) {
                    Conta registrada na liquidação. O pagamento será vinculado a ela.
                  } @else {
                    A liquidação antiga não tem conta registrada. Informe a conta para este pagamento.
                  }
                </mat-hint>
                <mat-error>Informe a conta de destino.</mat-error>
              </mat-form-field>
            }
            @if (data.kind === 'payment') {
              <mat-form-field appearance="outline" class="full-width"
                ><mat-label>Número do protocolo</mat-label
                ><input
                  matInput
                  formControlName="protocolNumber"
                  maxlength="100"
                  placeholder="Ex.: 2026/000123"
                  required
                  matTooltip="Informe o protocolo usado para identificar e acompanhar este pagamento."
                /><mat-hint>Obrigatório · número usado para localizar o processo.</mat-hint
                ><mat-error>Informe o número do protocolo.</mat-error></mat-form-field
              >
              <section class="pdf-field full-width" aria-labelledby="payment-pdf-label">
                <div class="pdf-heading">
                  <div>
                    <strong id="payment-pdf-label">Ofício do pagamento em PDF</strong>
                    <p>Anexe o Ofício correspondente ao número informado. Limite de 10 MB.</p>
                  </div>
                  <label class="file-button">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      aria-label="Selecionar Ofício do pagamento em PDF"
                      #paymentPdfInput
                      (change)="selectPaymentPdf($event)"
                    />
                    Selecionar PDF
                  </label>
                </div>
                @if (selectedPaymentPdf(); as file) {
                  <div class="selected-file">
                    <span>{{ file.name }} · {{ fileSize(file.size) }}</span>
                    <button mat-button type="button" (click)="clearPaymentPdf(paymentPdfInput)">
                      Remover
                    </button>
                  </div>
                } @else {
                  @if (editing && payment()?.paymentDocument; as document) {
                    <span class="pdf-empty">PDF atual: {{ document.fileName }} · anexe outro para substituí-lo.</span>
                  } @else {
                    <span class="pdf-empty">Nenhum arquivo selecionado</span>
                  }
                }
                @if (paymentDocumentError()) {
                  <p class="pdf-error" role="alert">{{ paymentDocumentError() }}</p>
                }
              </section>
            }
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Observações (opcional)</mat-label>
              <textarea
                matInput
                formControlName="observations"
                rows="3"
                maxlength="2000"
                placeholder="Registre detalhes importantes desta etapa"
                matTooltip="Use este espaço para informações complementares que ajudem na conferência."
              ></textarea>
              <mat-hint>Até 2.000 caracteres.</mat-hint>
              <mat-error>Use no máximo 2.000 caracteres.</mat-error>
            </mat-form-field>
            @if (editing) {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Justificativa da correção</mat-label>
                <textarea matInput formControlName="reason" rows="3" maxlength="2000" required
                  placeholder="Explique por que os dados precisam ser corrigidos"></textarea>
                <mat-hint>Obrigatória · ficará registrada no histórico com os dados anteriores e corrigidos.</mat-hint>
                <mat-error>Informe uma justificativa com pelo menos 5 caracteres.</mat-error>
              </mat-form-field>
            }
          } @else {
            <mat-form-field appearance="outline" class="full-width"
              ><mat-label>Motivo do estorno</mat-label
              ><textarea
                matInput
                formControlName="reason"
                rows="3"
                maxlength="2000"
                required
              ></textarea
              ><mat-error
                >Explique o motivo, com pelo menos 5 caracteres.</mat-error
              ></mat-form-field
            >
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end"
        ><button mat-button type="button" (click)="cancel()">Cancelar</button
        ><button mat-flat-button type="submit" [disabled]="saving()">
          {{ data.kind === 'reversal' ? 'Confirmar estorno' : editing ? 'Salvar correção' : 'Registrar lançamento' }}
        </button></mat-dialog-actions
      >
    </form>
  `,
  styles: `
    .execution-context {
      display: grid;
      gap: 5px;
      margin: 0 0 16px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--app-line);
    }
    .execution-context span {
      font-size: 13px;
      color: var(--app-muted);
    }
    .stage-card {
      padding: 13px 15px;
      margin-bottom: 20px;
      border: 1px solid var(--app-line);
      border-left: 3px solid var(--app-primary);
      border-radius: 4px;
      background: var(--app-background);
    }
    .stage-card strong {
      font-size: 13px;
    }
    .stage-card p {
      margin: 4px 0;
      color: var(--app-muted);
      font-size: 13px;
      line-height: 1.45;
    }
    .stage-card span {
      font-size: 12px;
      font-weight: 600;
    }
    .stage-card.cash-stage {
      border-left-color: var(--app-danger);
    }
    .stage-card.return-stage {
      border-left-color: var(--app-success);
    }
    .limit-note {
      margin: 0 0 24px;
    }
    .limit-note > span {
      display: block;
      font-size: 12px;
      margin-top: 6px;
    }
    .reversal-context {
      margin: 0 0 10px;
    }
    p.muted {
      margin-bottom: 25px;
    }
    .form-grid {
      margin-top: 20px;
    }
    .pdf-field {
      padding: 14px 15px;
      border: 1px solid var(--app-line);
      border-radius: 4px;
      background: var(--app-background);
    }
    .pdf-heading,
    .selected-file {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .pdf-heading strong {
      font-size: 13px;
      font-weight: 500;
    }
    .pdf-heading p,
    .pdf-empty {
      margin: 4px 0 0;
      color: var(--app-muted);
      font-size: 12px;
    }
    .file-button {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      min-height: 36px;
      padding: 0 12px;
      overflow: hidden;
      border: 1px solid var(--app-primary);
      border-radius: 4px;
      color: var(--app-primary);
      background: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .file-button:focus-within {
      outline: 2px solid var(--app-primary);
      outline-offset: 2px;
    }
    .file-button input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .selected-file {
      margin-top: 12px;
      color: var(--app-text);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .pdf-empty {
      display: block;
      margin-top: 12px;
    }
    .pdf-error {
      margin: 10px 0 0;
      color: var(--app-danger);
      font-size: 12px;
    }
    textarea {
      resize: none;
    }
    mat-dialog-actions {
      padding: 16px 24px 20px;
    }
  `,
})
export class ExecutionDialog {
  readonly store = inject(DemoStore);
  readonly dateMask = PT_BR_DATE_MASK;
  readonly data = inject<ExecutionDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ExecutionDialog, boolean>);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(MatSnackBar);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly selectedCommitmentPdf = signal<File | null>(null);
  readonly documentError = signal('');
  readonly selectedPaymentPdf = signal<File | null>(null);
  readonly paymentDocumentError = signal('');
  readonly receipt = computed(() =>
    this.store.receipts().find((r) => r.id === this.data.receiptId),
  );
  readonly expense = computed(() =>
    this.store.expenses().find((e) => e.id === this.data.expenseId),
  );
  readonly payment = computed(() =>
    this.store.payments().find((p) => p.id === this.data.paymentId),
  );
  readonly liquidation = computed(() =>
    this.store.liquidations().find((item) => item.id === this.data.postingId),
  );
  readonly editing = this.data.mode === 'edit';
  readonly registeredDestinationAccount = computed(() =>
    this.data.expenseId ? this.store.expenseDestinationAccount(this.data.expenseId) : null,
  );
  readonly destinationAccountReadonly = computed(
    () => this.data.kind === 'payment' && Boolean(this.registeredDestinationAccount()),
  );
  readonly title = (this.editing ? {
    commitment: 'Corrigir empenho',
    liquidation: 'Corrigir liquidação',
    payment: 'Corrigir pagamento',
    reversal: 'Estornar pagamento',
  } : {
    commitment: 'Registrar despesa',
    liquidation: 'Registrar liquidação',
    payment: 'Registrar pagamento',
    reversal: 'Estornar pagamento',
  })[this.data.kind];
  readonly stageLabel = {
    commitment: 'Etapa 1 · Empenho',
    liquidation: 'Etapa 2 · Liquidação',
    payment: 'Etapa 3 · Pagamento',
    reversal: 'Ajuste · Estorno',
  }[this.data.kind];
  readonly stageExplanation = {
    commitment:
      'Reserve uma parte do recebimento para uma despesa identificada. Você poderá liquidar e pagar esse empenho depois.',
    liquidation:
      'Confirme o valor do material entregue ou do serviço executado. Se foi parcial, registre somente a parcela comprovada.',
    payment:
      'Registre a saída do dinheiro, informe o protocolo e o número do Ofício e anexe o PDF correspondente.',
    reversal:
      'Registre a devolução de um pagamento. O lançamento original será preservado no histórico.',
  }[this.data.kind];
  readonly cashEffect = {
    commitment: 'Efeito no caixa: não reduz o saldo bancário.',
    liquidation: 'Efeito no caixa: não reduz o saldo bancário.',
    payment: 'Efeito no caixa: reduz o saldo bancário nesta data.',
    reversal: 'Efeito no caixa: devolve o valor ao saldo bancário nesta data.',
  }[this.data.kind];
  readonly dateHint =
    this.data.kind === 'reversal'
      ? 'Informe a data em que o valor voltou à conta.'
      : 'Use a data do documento correspondente a esta etapa.';
  readonly amountTooltip =
    this.data.kind === 'payment'
      ? 'O valor pago precisa estar liquidado e reduzirá o saldo de caixa.'
      : this.data.kind === 'liquidation'
        ? 'Registre somente o que já foi entregue ou executado; ainda não é pagamento.'
        : 'O empenho reserva o valor para a despesa; ainda não é pagamento.';
  readonly limitLabel = {
    commitment: 'Disponível para empenhar',
    liquidation: 'Empenhado a liquidar',
    payment: 'Liquidado a pagar',
    reversal: '',
  }[this.data.kind];
  readonly limit = computed(() =>
    this.data.kind === 'commitment'
      ? this.store.receiptSummary(this.data.receiptId, 2100).toCommit
      : this.data.expenseId
        ? this.data.kind === 'liquidation'
          ? this.store.expenseSummary(this.data.expenseId, 2100).toLiquidate
          : this.store.expenseSummary(this.data.expenseId, 2100).toPay
        : '0.00',
  );
  readonly form = new FormGroup({
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    supplier: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    cnpj: new FormControl('', {
      nonNullable: true,
      validators: [validateOptionalCnpj],
    }),
    document: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    destinationAccount: new FormControl('', { nonNullable: true }),
    protocolNumber: new FormControl('', { nonNullable: true }),
    observations: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    date: new FormControl<Date | null>(new Date(), [Validators.required]),
    amount: new FormControl<string | null>(null, [Validators.required]),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(5), Validators.maxLength(2000)],
    }),
  });
  constructor() {
    this.ref.disableClose = true;
    this.ref
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.cancel());
    this.ref
      .keydownEvents()
      .pipe(
        filter((event) => event.key === 'Escape'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.cancel());
    this.form.controls.cnpj.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const formatted = formatCnpj(value);
      if (formatted !== value) this.form.controls.cnpj.setValue(formatted, { emitEvent: false });
    });
    if (this.data.kind === 'payment') {
      this.form.controls.protocolNumber.setValidators([
        Validators.required,
        Validators.maxLength(100),
      ]);
      this.form.controls.protocolNumber.updateValueAndValidity({ emitEvent: false });
    }
    if (this.data.kind === 'liquidation' || this.data.kind === 'payment') {
      this.form.controls.destinationAccount.setValidators([
        Validators.required,
        Validators.maxLength(100),
      ]);
      this.form.controls.destinationAccount.setValue(
        this.data.kind === 'payment' ? this.registeredDestinationAccount() ?? '' : '',
      );
      this.form.controls.destinationAccount.updateValueAndValidity({ emitEvent: false });
    }
    if (this.data.kind !== 'commitment') {
      this.form.controls.description.disable();
      this.form.controls.supplier.disable();
    }
    if (this.data.kind === 'reversal') {
      this.form.controls.amount.disable();
      this.form.controls.document.disable();
    } else if (!this.editing) this.form.controls.reason.disable();
    if (this.editing) this.populateCorrection();
  }
  private populateCorrection(): void {
    let date: string | undefined;
    let amount: string | undefined;
    if (this.data.kind === 'commitment') {
      const item = this.expense();
      if (!item) return;
      this.form.patchValue({
        description: item.description, supplier: item.supplier, cnpj: item.cnpj ?? '',
        document: item.document, observations: item.observations ?? '',
      });
      date = item.commitmentDate;
      amount = item.amount;
    } else if (this.data.kind === 'liquidation') {
      const item = this.liquidation();
      if (!item) return;
      this.form.patchValue({
        document: item.document, destinationAccount: item.destinationAccount ?? '',
        observations: item.observations ?? '',
      });
      date = item.date;
      amount = item.amount;
    } else if (this.data.kind === 'payment') {
      const item = this.payment();
      if (!item) return;
      this.form.patchValue({
        document: item.document, destinationAccount: item.destinationAccount ?? '',
        protocolNumber: item.protocolNumber ?? '', observations: item.observations ?? '',
      });
      date = item.date;
      amount = item.amount;
    }
    if (date) this.form.controls.date.setValue(new Date(`${date}T12:00:00`));
    if (amount) this.form.controls.amount.setValue(amount);
  }
  cancel() {
    if (!this.form.dirty) {
      this.ref.close();
      return;
    }
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Descartar preenchimento?',
          message: 'Este lançamento ainda não foi salvo.',
          confirmLabel: 'Descartar',
          danger: true,
        },
        width: '420px',
      })
      .afterClosed()
      .subscribe((discard) => {
        if (discard) this.ref.close();
      });
  }
  async selectCommitmentPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.documentError.set('');
    this.selectedCommitmentPdf.set(null);
    if (!file) return;
    if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.pdf')) {
      this.documentError.set('Selecione a Nota de Empenho em formato PDF.');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      this.documentError.set('O arquivo deve ter conteúdo e no máximo 10 MB.');
      input.value = '';
      return;
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      this.documentError.set('O arquivo selecionado não parece ser um PDF válido.');
      input.value = '';
      return;
    }
    this.selectedCommitmentPdf.set(file);
    this.form.markAsDirty();
  }
  clearCommitmentPdf(input?: HTMLInputElement): void {
    this.selectedCommitmentPdf.set(null);
    this.documentError.set('');
    if (input) input.value = '';
    this.form.markAsDirty();
  }
  async selectPaymentPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.paymentDocumentError.set('');
    this.selectedPaymentPdf.set(null);
    if (!file) return;
    if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.pdf')) {
      this.paymentDocumentError.set('Selecione o Ofício do pagamento em formato PDF.');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      this.paymentDocumentError.set('O arquivo deve ter conteúdo e no máximo 10 MB.');
      input.value = '';
      return;
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      this.paymentDocumentError.set('O arquivo selecionado não parece ser um PDF válido.');
      input.value = '';
      return;
    }
    this.selectedPaymentPdf.set(file);
    this.form.markAsDirty();
  }
  clearPaymentPdf(input?: HTMLInputElement): void {
    this.selectedPaymentPdf.set(null);
    this.paymentDocumentError.set('');
    if (input) input.value = '';
    this.form.markAsDirty();
  }
  fileSize(size: number): string {
    return size < 1024 * 1024
      ? `${Math.max(1, Math.ceil(size / 1024))} KB`
      : `${(size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.error.set('');
    const value = this.form.getRawValue();
    if (
      this.form.invalid ||
      this.documentError() ||
      (this.data.kind === 'payment' && this.paymentDocumentError()) ||
      !value.date ||
      (this.data.kind !== 'reversal' && !value.amount)
    ) {
      this.error.set('Confira os campos destacados. O lançamento ainda não foi registrado.');
      return;
    }
    const date = `${value.date.getFullYear()}-${String(value.date.getMonth() + 1).padStart(2, '0')}-${String(value.date.getDate()).padStart(2, '0')}`;
    this.saving.set(true);
    try {
      if (this.editing && this.data.kind === 'commitment')
        await this.store.correctExpenseBackend(this.data.expenseId!, {
          description: value.description,
          supplier: value.supplier,
          cnpj: value.cnpj,
          document: value.document,
          commitmentDate: date,
          amount: value.amount!,
          observations: value.observations.trim() || null,
        }, value.reason, this.selectedCommitmentPdf() ?? undefined);
      if (this.editing && this.data.kind === 'liquidation')
        await this.store.correctLiquidationBackend(this.data.postingId!, {
          expenseId: this.data.expenseId!,
          date,
          amount: value.amount!,
          document: value.document,
          destinationAccount: value.destinationAccount.trim(),
          observations: value.observations.trim() || null,
        }, value.reason);
      if (this.editing && this.data.kind === 'payment')
        await this.store.correctPaymentBackend(this.data.paymentId!, {
          expenseId: this.data.expenseId!,
          date,
          amount: value.amount!,
          document: value.document,
          destinationAccount: value.destinationAccount.trim(),
          protocolNumber: value.protocolNumber.trim(),
          observations: value.observations.trim() || null,
        }, value.reason, this.selectedPaymentPdf() ?? undefined);
      if (this.data.kind === 'commitment')
        if (!this.editing) await this.store.createExpense({
          receiptId: this.data.receiptId,
          description: value.description,
          supplier: value.supplier,
          cnpj: value.cnpj,
          document: value.document,
          commitmentDate: date,
          amount: value.amount!,
          observations: value.observations.trim() || null,
        }, this.selectedCommitmentPdf() ?? undefined);
      if (this.data.kind === 'liquidation')
        if (!this.editing) await this.store.createLiquidation({
          expenseId: this.data.expenseId!,
          date,
          amount: value.amount!,
          document: value.document,
          destinationAccount: value.destinationAccount.trim(),
          observations: value.observations.trim() || null,
        });
      if (this.data.kind === 'payment')
        if (!this.editing) await this.store.createPayment({
          expenseId: this.data.expenseId!,
          date,
          amount: value.amount!,
          document: value.document,
          destinationAccount: value.destinationAccount.trim(),
          protocolNumber: value.protocolNumber.trim(),
          observations: value.observations.trim() || null,
        }, this.selectedPaymentPdf() ?? undefined);
      if (this.data.kind === 'reversal')
        await this.store.reversePaymentBackend(this.data.paymentId!, date, value.reason);
      if (value.date.getFullYear() > this.store.year())
        this.store.year.set(value.date.getFullYear());
      this.toast.open(this.editing ? 'Correção salva no histórico.' : 'Lançamento registrado.', 'Fechar', { duration: 4500 });
      this.ref.close(true);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Não foi possível registrar o lançamento.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
