import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, TicketValidationError, type CreatedTicket, type CreateTicketInput } from '@/lib/api';
import {
  answersToSubmit,
  inputFields,
  parseFormSchema,
  validateAnswers,
  type FormAnswer,
  type FormAnswers,
} from '@/lib/formSchema';
import { syncRefresh } from '@/lib/sync';
import { Company, Location, User, Template } from '@/types/api';
import { TemplateFormFields } from './TemplateFormFields';
import {
  Plus,
  Building,
  User as UserIcon,
  MapPin,
  AlertCircle,
  CheckCircle,
  Loader2,
  Upload,
  X,
  Paperclip,
  FileText,
} from 'lucide-react';

type Priority = CreateTicketInput['priority'];

interface FormState {
  summary: string;
  description: string;
  priority: Priority;
  company_id: string;
  location_id: string;
  for_user_id: string;
  template_id: string;
  attachment: File | null;
}

const EMPTY_FORM: FormState = {
  summary: '',
  description: '',
  priority: 'HIGH',
  company_id: '',
  location_id: '',
  for_user_id: '',
  template_id: '',
  attachment: null,
};

/** Server field names that map onto a control of this form. */
const FIELD_LABELS: Record<string, string> = {
  summary: 'Betreff',
  description: 'Beschreibung',
  priority: 'Priorität',
  company_id: 'Kunde',
  location_id: 'Standort',
  for_user_id: 'Ansprechpartner',
  dyn_template_id: 'Vorlage',
};

interface NewTicketFormProps {
  /** Opens a ticket in the main view, used for the new ticket. */
  onOpenTicket?: (ticketId: number) => void;
}

/**
 * Creates a ticket.
 *
 * The server checks what the web wizard offers (INTEGRATIONS.md §4.2): the
 * location must belong to the customer, the contact to the location, and a
 * template must be enabled for the customer. So the location and contact are
 * required here, and templates are only offered once a customer is chosen.
 * A template with a form shows its fields; their answers go out as
 * `form_answers` and the server checks them against the template again.
 */
export function NewTicketForm({ onOpenTicket }: NewTicketFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [answers, setAnswers] = useState<FormAnswers>({});

  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  /** Messages per control: FormState keys, or template field keys. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ ticket: CreatedTicket | null; companyName: string } | null>(null);

  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = templates.find((t) => t.id.toString() === form.template_id);
  const schema = useMemo(() => parseFormSchema(selectedTemplate?.form_schema), [selectedTemplate]);
  const hasForm = schema !== null && inputFields(schema).length > 0;

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.getCustomers();
        const list = response.customers ?? response.data?.customers ?? [];
        setCompanies(list);
        // A customer user only gets their own company.
        if (list.length === 1) selectCompany(list[0]);
      } catch (error) {
        console.error('Failed to fetch customers:', error);
        setFormError('Die Kundenliste konnte nicht geladen werden. Bitte erneut versuchen.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Locations and templates follow the customer.
  useEffect(() => {
    setLocations([]);
    setTemplates([]);
    if (!form.company_id) return;

    const companyId = parseInt(form.company_id, 10);
    let active = true;

    void apiClient
      .getCustomerLocations(companyId)
      .then((response) => {
        if (!active) return;
        const list = response.locations ?? response.data?.locations ?? [];
        setLocations(list);
        if (list.length === 1) setForm((prev) => ({ ...prev, location_id: list[0].id.toString() }));
      })
      .catch((error) => console.error('Failed to fetch locations:', error));

    void apiClient
      .getTemplates(companyId)
      .then((response) => {
        if (active) setTemplates(response.templates ?? response.data?.templates ?? []);
      })
      .catch((error) => console.error('Failed to fetch templates:', error));

    return () => {
      active = false;
    };
  }, [form.company_id]);

  // Contacts follow the location.
  useEffect(() => {
    setUsers([]);
    if (!form.location_id) return;

    let active = true;
    void apiClient
      .getLocationUsers(parseInt(form.location_id, 10))
      .then((response) => {
        if (!active) return;
        const list = response.users ?? response.data?.users ?? [];
        setUsers(list);
        if (list.length === 1) setForm((prev) => ({ ...prev, for_user_id: list[0].id.toString() }));
      })
      .catch((error) => console.error('Failed to fetch users:', error));

    return () => {
      active = false;
    };
  }, [form.location_id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Dependent choices no longer apply.
      if (key === 'location_id') next.for_user_id = '';
      return next;
    });
    if (key === 'template_id') {
      setAnswers({});
      setFieldErrors({});
    }
    clearFieldError(key);
    setFormError('');
  };

  const updateAnswer = useCallback((key: string, value: FormAnswer) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  }, []);

  function selectCompany(company: Company) {
    setForm((prev) => ({
      ...prev,
      company_id: company.id.toString(),
      location_id: '',
      for_user_id: '',
      template_id: '',
    }));
    setAnswers({});
    setFieldErrors({});
    setCompanySearchTerm(company.name);
    setShowCompanyDropdown(false);
    setFormError('');
  }

  const clearCompany = () => {
    setForm((prev) => ({ ...prev, company_id: '', location_id: '', for_user_id: '', template_id: '' }));
    setAnswers({});
    setCompanySearchTerm('');
    setShowCompanyDropdown(false);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setAnswers({});
    setFieldErrors({});
    setFormError('');
    setCompanySearchTerm('');
    if (companies.length === 1) selectCompany(companies[0]);
  };

  const filteredCompanies = useMemo(() => {
    const needle = companySearchTerm.toLowerCase();
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(needle) || company.number?.toLowerCase().includes(needle),
    );
  }, [companies, companySearchTerm]);

  /** The checks the server would make, so most mistakes never leave the form. */
  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const description = form.description.trim();
    if (!description) errors.description = 'Bitte das Anliegen beschreiben.';
    else if (description.length < 3) errors.description = 'Mindestens 3 Zeichen.';
    if (form.summary.trim().length > 255) errors.summary = 'Höchstens 255 Zeichen.';
    if (!form.company_id) errors.company_id = 'Bitte einen Kunden wählen.';
    if (!form.location_id) errors.location_id = 'Bitte einen Standort wählen.';
    if (!form.for_user_id) errors.for_user_id = 'Bitte einen Ansprechpartner wählen.';
    if (hasForm) Object.assign(errors, validateAnswers(schema, answers));
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError('Bitte die markierten Angaben prüfen.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    setCreated(null);

    try {
      const ticket = await apiClient.createTicket({
        description: form.description.trim(),
        summary: form.summary,
        priority: form.priority,
        company_id: parseInt(form.company_id, 10),
        location_id: parseInt(form.location_id, 10),
        for_user_id: parseInt(form.for_user_id, 10),
        dyn_template_id: form.template_id ? parseInt(form.template_id, 10) : undefined,
        form_answers: hasForm ? answersToSubmit(schema, answers) : undefined,
        attachment: form.attachment ?? undefined,
      });

      const companyName = companies.find((c) => c.id.toString() === form.company_id)?.name ?? '';
      setCreated({ ticket, companyName });
      reset();
      void syncRefresh().catch(() => undefined);
    } catch (error) {
      console.error('Failed to create ticket:', error);
      if (error instanceof TicketValidationError) {
        const mapped: Record<string, string> = {};
        const unplaced: string[] = [];
        for (const [key, messages] of Object.entries(error.errors)) {
          const message = messages[0] ?? 'Ungültig';
          const answerKey = key.startsWith('form_answers.') ? key.slice('form_answers.'.length).split('.')[0] : null;
          if (answerKey) mapped[answerKey] = message;
          else if (key in FIELD_LABELS) mapped[key === 'dyn_template_id' ? 'template_id' : key] = message;
          else unplaced.push(message);
        }
        setFieldErrors(mapped);
        setFormError(unplaced.length ? unplaced.join(' ') : error.message);
      } else {
        setFormError(error instanceof Error ? error.message : 'Das Ticket konnte nicht angelegt werden.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Neues Ticket</h1>
          <p className="text-muted-foreground">Formular wird geladen…</p>
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="mb-2 h-4 w-1/4 rounded bg-muted" />
                  <div className="h-10 rounded bg-muted" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fieldError = (key: string) =>
    fieldErrors[key] ? <p className="text-xs text-destructive">{fieldErrors[key]}</p> : null;
  const invalid = (key: string) => (fieldErrors[key] ? 'border-destructive' : undefined);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Neues Ticket</h1>
        <p className="text-muted-foreground">Pflichtfelder sind mit * markiert.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Angaben zum Ticket
          </CardTitle>
          <CardDescription>Je genauer die Beschreibung, desto schneller die Bearbeitung.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {created && (
              <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {created.ticket ? `Ticket #${created.ticket.id}` : 'Ticket'} angelegt
                    {created.companyName && ` für ${created.companyName}`}.
                  </span>
                  {created.ticket && onOpenTicket && (
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => onOpenTicket(created.ticket!.id)}>
                      Ticket öffnen
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Kunde */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Kunde *
              </Label>
              <div className="relative" ref={companyDropdownRef}>
                <Building className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Kunde suchen…"
                  value={companySearchTerm}
                  onChange={(e) => {
                    setCompanySearchTerm(e.target.value);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  className={invalid('company_id')}
                  style={{ paddingLeft: '2.75rem', paddingRight: '2rem' }}
                  disabled={isSubmitting || companies.length === 1}
                />
                {form.company_id && companies.length > 1 && (
                  <button
                    onClick={clearCompany}
                    className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    type="button"
                    aria-label="Kunde entfernen"
                  >
                    ×
                  </button>
                )}
                {showCompanyDropdown && filteredCompanies.length > 0 && companies.length > 1 && (
                  <Card className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto shadow-lg">
                    <CardContent className="p-0">
                      {filteredCompanies.slice(0, 10).map((company) => (
                        <button
                          key={company.id}
                          onClick={() => selectCompany(company)}
                          className="w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent hover:text-accent-foreground"
                          type="button"
                        >
                          <div className="font-medium">{company.name}</div>
                          {company.number && <div className="text-sm text-muted-foreground">#{company.number}</div>}
                        </button>
                      ))}
                      {filteredCompanies.length > 10 && (
                        <div className="border-t px-3 py-2 text-sm text-muted-foreground">
                          {filteredCompanies.length - 10} weitere — Suche eingrenzen
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
              {fieldError('company_id')}
            </div>

            {/* Standort und Ansprechpartner */}
            {form.company_id && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Standort *
                  </Label>
                  <Select
                    value={form.location_id}
                    onValueChange={(value) => update('location_id', value)}
                    disabled={isSubmitting || locations.length === 0}
                  >
                    <SelectTrigger className={`w-full ${invalid('location_id') ?? ''}`}>
                      <SelectValue placeholder={locations.length ? 'Standort wählen' : 'Keine Standorte'} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id.toString()}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError('location_id')}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    Ansprechpartner *
                  </Label>
                  <Select
                    value={form.for_user_id}
                    onValueChange={(value) => update('for_user_id', value)}
                    disabled={isSubmitting || users.length === 0}
                  >
                    <SelectTrigger className={`w-full ${invalid('for_user_id') ?? ''}`}>
                      <SelectValue
                        placeholder={
                          !form.location_id ? 'Erst Standort wählen' : users.length ? 'Person wählen' : 'Keine Personen'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((person) => (
                        <SelectItem key={person.id} value={person.id.toString()}>
                          {person.name}
                          {person.email && <span className="text-muted-foreground"> ({person.email})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError('for_user_id')}
                </div>
              </div>
            )}

            {/* Betreff */}
            <div className="space-y-2">
              <Label htmlFor="summary">Betreff</Label>
              <Input
                id="summary"
                placeholder="Kurz zusammengefasst (optional — sonst gilt die Beschreibung)"
                value={form.summary}
                onChange={(e) => update('summary', e.target.value)}
                maxLength={255}
                className={invalid('summary')}
                disabled={isSubmitting}
              />
              {fieldError('summary')}
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung *</Label>
              <Textarea
                id="description"
                placeholder="Problem oder Anfrage beschreiben…"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className={`min-h-[100px] ${invalid('description') ?? ''}`}
                disabled={isSubmitting}
              />
              {fieldError('description')}
            </div>

            {/* Priorität */}
            <div className="space-y-2">
              <Label>Priorität</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => update('priority', value as Priority)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal — 4 Tage</SelectItem>
                  <SelectItem value="HIGH">Hoch — 2 Tage</SelectItem>
                  <SelectItem value="VERY_HIGH">Sehr hoch — 8 Stunden</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vorlage und ihr Formular */}
            {form.company_id && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Vorlage
                  </Label>
                  <Select
                    value={form.template_id || '__none__'}
                    onValueChange={(value) => update('template_id', value === '__none__' ? '' : value)}
                    disabled={isSubmitting || templates.length === 0}
                  >
                    <SelectTrigger className={`w-full sm:w-[360px] ${invalid('template_id') ?? ''}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {templates.length ? 'Ohne Vorlage' : 'Keine Vorlagen für diesen Kunden'}
                      </SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError('template_id')}
                </div>

                {hasForm && (
                  <div className="rounded-md border p-4">
                    <TemplateFormFields
                      schema={schema}
                      answers={answers}
                      onChange={updateAnswer}
                      errors={fieldErrors}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Anhang */}
            <div className="space-y-2">
              <Label htmlFor="attachment" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Anhang
                <span className="text-xs font-normal text-muted-foreground">— eine Datei</span>
              </Label>
              {form.attachment ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                  <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{form.attachment.name}</span>
                  <span className="text-xs text-muted-foreground">{(form.attachment.size / 1024).toFixed(1)} KB</span>
                  <button
                    type="button"
                    onClick={() => update('attachment', null)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    disabled={isSubmitting}
                    aria-label="Anhang entfernen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                // One file: createTicketMobile reads `ticket_image` as a single
                // upload, and PHP keeps only the last of repeated keys.
                <Input
                  id="attachment"
                  type="file"
                  onChange={(e) => {
                    update('attachment', e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  disabled={isSubmitting}
                  className="cursor-pointer"
                />
              )}
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={reset} disabled={isSubmitting}>
                Zurücksetzen
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird angelegt…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Ticket anlegen
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
