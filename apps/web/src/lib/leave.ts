import { z } from 'zod';
export const leaveTypes = { PERSONAL: 'Permiso personal', ABSENCE: 'Ausencia', DAY_OFF: 'Día libre solicitado', OTHER: 'Otro' } as const;
export const leaveStatuses = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' } as const;
const date = z.iso.date({ error: 'Indica una fecha válida.' });
export const leaveSchema = z.object({
  request_type: z.enum(['PERSONAL', 'ABSENCE', 'DAY_OFF', 'OTHER']),
  start_date: date,
  end_date: date,
  reason: z.string().trim().max(1000, 'El motivo puede tener hasta 1000 caracteres.'),
}).refine(values => values.end_date >= values.start_date, { path: ['end_date'], message: 'El término debe ser igual o posterior al inicio.' });
export type LeaveInput = z.infer<typeof leaveSchema>;
export type LeaveRequest = LeaveInput & {
  id: string; business: string; employee: string; employee_name: string;
  status: keyof typeof leaveStatuses; reviewed_by: string | null; reviewed_by_name: string | null;
  reviewed_at: string | null; review_note: string; created_at: string; updated_at: string;
  can_cancel: boolean; can_review: boolean;
};
export type LeaveDetail = LeaveRequest & { affected_shifts: { visible: boolean; count: number; results: { id: string; starts_at: string; ends_at: string }[] } };
