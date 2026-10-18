import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-feedback-page',
  imports: [RouterLink, MatButtonModule],
  template: `<section class="page"><div class="empty-state"><h1 class="page-title">{{ denied ? 'Acesso indisponível para este perfil' : 'Página não encontrada' }}</h1><p>{{ denied ? 'Seu perfil não tem acesso a esta função. Volte para uma área autorizada.' : 'Escolha uma área no menu para continuar.' }}</p><a mat-flat-button routerLink="/recebimentos">Voltar aos recebimentos</a></div></section>`,
})
export class FeedbackPage {
  readonly denied = inject(ActivatedRoute).snapshot.data['denied'] === true;
}
