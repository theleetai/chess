import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';

// Add animations to the app config
const configWithAnimations = {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    provideAnimations()
  ]
};

bootstrapApplication(AppComponent, configWithAnimations)
  .catch((err) => console.error(err));
