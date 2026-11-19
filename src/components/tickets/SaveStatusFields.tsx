import { useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { defaultSaveStatus, ownWorkStatuses, useSaveStatuses } from '@/lib/saveStatuses';

interface SaveStatusFieldsProps {
  statusId: string;
  onStatusChange: (id: string) => void;
  /** `datetime-local` value; only shown for a status that needs a date. */
  appointment: string;
  onAppointmentChange: (value: string) => void;
  compact?: boolean;
  /** Which status to start on; see defaultSaveStatus. */
  prefer?: 'close' | 'keep-open';
}

/**
 * Status picker for saving one's own work, plus the appointment field a
 * "scheduled" status needs. The options come from the server's status
 * catalog; a selection the catalog no longer offers falls back to its default.
 */
export function SaveStatusFields({
  statusId,
  onStatusChange,
  appointment,
  onAppointmentChange,
  compact = false,
  prefer = 'close',
}: SaveStatusFieldsProps) {
  const statuses = ownWorkStatuses(useSaveStatuses());
  const selected = statuses.find((s) => String(s.id) === statusId);
  const id = useId();

  useEffect(() => {
    if (selected) return;
    const fallback = defaultSaveStatus(statuses, prefer);
    if (fallback) onStatusChange(String(fallback.id));
  }, [selected, statuses, onStatusChange, prefer]);

  const labelClass = compact
    ? 'text-[11px] uppercase tracking-wide text-muted-foreground'
    : undefined;

  return (
    <>
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <Label htmlFor={`${id}-status`} className={labelClass}>
          {compact ? 'Status' : 'Neuer Ticketstatus'}
        </Label>
        <Select value={selected ? statusId : ''} onValueChange={onStatusChange}>
          <SelectTrigger id={`${id}-status`} className={cn(compact && 'h-8 w-[220px] text-xs')}>
            <SelectValue placeholder="Status wählen" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={String(status.id)} className={cn(compact && 'text-xs')}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected?.requires_date && (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          <Label htmlFor={`${id}-date`} className={labelClass}>
            Termin
          </Label>
          <Input
            id={`${id}-date`}
            type="datetime-local"
            value={appointment}
            onChange={(e) => onAppointmentChange(e.target.value)}
            className={cn(compact && 'h-8 w-[200px] text-xs')}
          />
        </div>
      )}
    </>
  );
}

