export type TrainingChoice = {
  id: number;
  name_en: string;
  training_category_id: number | null;
  requires_certificate_number: boolean;
  requires_provider: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
};

export type TrainingFields = {
  training_type_id: number | null;
  training_category_id: number | null;
  certificate_number: string;
  provider: string;
  completion_date: string;
  expiry_date: string;
};

/** Derived review flag only: never rewrite a certificate after a catalog edit. */
export function trainingCategoryNeedsReview(recordedCategoryId: number | null, type: Pick<TrainingChoice,'training_category_id'> | undefined): boolean {
  return type !== undefined && recordedCategoryId !== type.training_category_id;
}

export function validateTrainingFields(form: TrainingFields, types: readonly TrainingChoice[], retainedTypeId?: number): string | null {
  if (!form.training_type_id) return 'Choose a training type.';
  const type = types.find(item => item.id === form.training_type_id);
  if (!type) return 'The selected training type could not be checked. Reload the training choices before saving.';
  if ((type.is_active === false || type.deleted_at) && type.id !== retainedTypeId) return 'The selected training type is inactive. Choose an active training type.';
  if (form.training_category_id !== null && form.training_category_id !== type.training_category_id) {
    return type.training_category_id === null
      ? 'This training type has no category configured. Clear the category or ask an administrator to configure the training type.'
      : 'The training category does not match the selected training type. Use the category configured for this type.';
  }
  if (type.requires_certificate_number && !form.certificate_number.trim()) return 'Certificate Number is required for the selected training type.';
  if (type.requires_provider && !form.provider.trim()) return 'Provider is required for the selected training type.';
  if (form.completion_date && form.expiry_date && form.expiry_date < form.completion_date) return 'Expiry Date must be on or after Completion Date.';
  return null;
}

/** A deliberate type selection also selects its configured category. */
export function trainingTypeSelection(value: string | number | null, types: readonly TrainingChoice[]) {
  const id = value === '' || value === null ? null : Number(value);
  const type = types.find(item => item.id === id);
  return { training_type_id: id, training_category_id: type?.training_category_id ?? null };
}
