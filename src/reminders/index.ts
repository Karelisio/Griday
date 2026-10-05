/** Rappel quotidien : planification, synchronisation des notifications programmées, activation, événements (rappel ouvert, autorisation retirée). */
export { useEnableReminder, useReminderOpened, useReminderRevoked, useReminderSync } from './hooks';
export type { EnableOutcome } from './hooks';
export { planReminders, REMINDER_DAYS } from './plan';
export type { PlanOptions } from './plan';
