import { ApplicationConfig, LOCALE_ID, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { routes } from './app.routes';
import { PtBrDateAdapter, PtBrDatepickerIntl, APP_DATE_FORMATS } from './shared/date-adapter';
import { PtBrPaginatorIntl } from './shared/paginator-intl';
import { apiSessionInterceptor } from './core/api/api.interceptor';
import { ApiClient } from './core/api/api-client';
import { DemoStore } from './core/demo-store';

registerLocaleData(localePt, 'pt-BR');

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: DemoStore, useFactory: () => new DemoStore(inject(ApiClient)) },
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([apiSessionInterceptor])),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' },
    { provide: DateAdapter, useClass: PtBrDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: APP_DATE_FORMATS },
    { provide: MatDatepickerIntl, useClass: PtBrDatepickerIntl },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', floatLabel: 'always' } },
    { provide: MatPaginatorIntl, useClass: PtBrPaginatorIntl },
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 4500, horizontalPosition: 'end', verticalPosition: 'bottom', politeness: 'polite' } },
  ]
};
