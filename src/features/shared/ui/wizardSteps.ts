export interface WizardStep {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
  /** Value for the legacy `data-step-back` attribute on a completed step. */
  backValue?: string | number;
}
