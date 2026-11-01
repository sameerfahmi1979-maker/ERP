/** Translate only exact, known native validation rules. Never expose raw
 * database messages/details (they may contain personal or submitted data). */
export function documentEmployeeRejection(error: {code?: string; message?: string}): string | null {
  if (error.code === '23514') {
    const messages: Record<string,string> = {
      'Designation does not match the selected employer and department': 'Choose a designation available for the selected employer and department. No part of this attempt was saved.',
      'Department is not an active choice for this employer and branch': 'Choose a current department for the selected employer and branch. No part of this attempt was saved.',
      'Branch must belong to the selected employer': 'Choose an active branch belonging to the selected employer. No part of this attempt was saved.',
      'Select an active employer': 'Choose an active employer before saving. No part of this attempt was saved.',
      'Category, identity, employer and joining date are required for a new employee': 'Complete employee category, identity, employer and joining date. No part of this attempt was saved.',
      'Invalid compliance chronology': 'Check the included compliance dates: expiry must not be before issue or completion. No part of this attempt was saved.',
    };
    return Object.hasOwn(messages,error.message??'') ? messages[error.message!] : null;
  }
  if (error.code === '23503') return 'A selected record is no longer an available choice. Refresh the choices and review the employee and compliance selections. No part of this attempt was saved.';
  return null;
}
