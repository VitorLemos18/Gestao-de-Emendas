import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface WorkflowNextStepData {
  title: string;
  message: string;
  actionLabel: string;
}

@Component({
  selector: 'app-workflow-next-step-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <p class="muted">Você pode continuar agora ou fazer esta etapa depois pelo menu.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">Fazer depois</button>
      <button mat-flat-button type="button" (click)="ref.close(true)">
        {{ data.actionLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content p {
      line-height: 1.5;
    }
    .muted {
      color: var(--app-muted);
      font-size: 12px;
    }
    mat-dialog-actions {
      padding: 8px 24px 20px;
    }
  `,
})
export class WorkflowNextStepDialog {
  readonly data = inject<WorkflowNextStepData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<WorkflowNextStepDialog, boolean>);
}
