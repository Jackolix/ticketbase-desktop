import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle,
  Info,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Settings as SettingsIcon,
  User,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import { useAvailability } from '@/hooks/useAvailability';
import { apiClient } from '@/lib/api';

/** Mail setting ids, as expected by userMailSettings(type). */
const MAIL_TYPES = {
  pool: 1,
  help: 2,
  message: 3,
  forward: 4,
} as const;

interface MailSettings {
  new_ticket_pool_mail: boolean;
  new_help_mail: boolean;
  new_message_mail: boolean;
  new_forward_mail: boolean;
}

export function Settings() {
  const { user } = useAuth();
  const { currentVersion, isCheckingForUpdate, checkForUpdate, lastError, lastCheckTime } =
    useUpdater();
  const { settings, updateSettings, requestNotificationPermission } = useNotifications();

  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [mail, setMail] = useState<MailSettings>({
    new_ticket_pool_mail: false,
    new_help_mail: false,
    new_message_mail: false,
    new_forward_mail: false,
  });

  const [busy, setBusy] = useState<string | null>(null);
  // Shared with the sidebar action, so the two cannot disagree.
  const { isAvailable, isBusy: isAvailabilityBusy, setAvailable } = useAvailability();

  const fetchMailSettings = useCallback(async () => {
    if (!user) return;
    try {
      const response = await apiClient.getUsersMailSettings(user.id);
      if (response.status === 'success' && response.data) {
        setMail(response.data.user_mail_settings_arr);
      }
    } catch (error) {
      console.error('Failed to fetch mail settings:', error);
    }
  }, [user]);

  useEffect(() => {
    void fetchMailSettings();
  }, [fetchMailSettings]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!profile.name.trim()) {
      toast.error('Name darf nicht leer sein');
      return;
    }

    setBusy('profile');
    try {
      const response = await apiClient.editProfile(user.id, profile.name, profile.phone);
      if (response.status === 'success') toast.success('Profil gespeichert');
      else toast.error(response.message || 'Profil konnte nicht gespeichert werden');
    } catch {
      toast.error('Profil konnte nicht gespeichert werden');
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (password.next.length < 6) {
      toast.error('Das Passwort muss mindestens 6 Zeichen haben');
      return;
    }
    if (password.next !== password.confirm) {
      toast.error('Die Passwörter stimmen nicht überein');
      return;
    }

    setBusy('password');
    try {
      const response = await apiClient.changePassword(user.id, password.next);
      if (response.status === 'success') {
        toast.success('Passwort geändert');
        setPassword({ next: '', confirm: '' });
      } else {
        toast.error(response.message || 'Passwort konnte nicht geändert werden');
      }
    } catch {
      toast.error('Passwort konnte nicht geändert werden');
    } finally {
      setBusy(null);
    }
  };

  const setMailSetting = async (key: keyof MailSettings, type: number, value: boolean) => {
    if (!user) return;

    const previous = mail[key];
    setMail((m) => ({ ...m, [key]: value })); // optimistic

    try {
      const response = await apiClient.userMailSettings(user.id, value ? 1 : 0, type);
      if (response.status !== 'success') throw new Error(response.message);
    } catch (error) {
      console.error('Failed to update mail settings:', error);
      setMail((m) => ({ ...m, [key]: previous })); // roll back
      toast.error('E-Mail-Einstellung konnte nicht gespeichert werden');
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-5">
      <PageHeader
        title="Einstellungen"
        description={user?.email}
        icon={SettingsIcon}
      />

      {/* Availability is the one setting with same-day operational meaning, so
          it sits above the tabs rather than buried in one. */}
      <Card className="flex-row items-center justify-between gap-4 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Heute verfügbar</p>
          <p className="text-xs text-muted-foreground">
            Steuert, ob dir heute Tickets zugewiesen werden.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAvailable !== null && (
            <span
              className={`text-xs ${isAvailable ? 'text-tone-success' : 'text-muted-foreground'}`}
            >
              {isAvailable ? 'Verfügbar' : 'Nicht verfügbar'}
            </span>
          )}
          {isAvailabilityBusy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={isAvailable ?? false}
              onCheckedChange={(v) => void setAvailable(v)}
              disabled={isAvailable === null}
              aria-label="Heute verfügbar"
            />
          )}
        </div>
      </Card>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" /> Profil
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" /> Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="mail" className="gap-1.5 text-xs">
            <Mail className="h-3.5 w-3.5" /> E-Mail
          </TabsTrigger>
          <TabsTrigger value="about" className="gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5" /> Über
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="m-0 space-y-4">
          <Section title="Profil" icon={User}>
            <form onSubmit={saveProfile} className="space-y-3">
              <Row label="Name" htmlFor="name">
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  className="h-8 text-xs"
                />
              </Row>
              <Row label="Telefon" htmlFor="phone">
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  className="h-8 text-xs"
                />
              </Row>
              <Row label="E-Mail">
                <Input value={user?.email ?? ''} disabled className="h-8 text-xs" />
              </Row>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy === 'profile'} className="h-8 gap-1.5 text-xs">
                  {busy === 'profile' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </form>
          </Section>

          <Section title="Passwort" icon={Lock}>
            <form onSubmit={savePassword} className="space-y-3">
              <Row label="Neues Passwort" htmlFor="new-password">
                <Input
                  id="new-password"
                  type="password"
                  value={password.next}
                  onChange={(e) => setPassword((p) => ({ ...p, next: e.target.value }))}
                  className="h-8 text-xs"
                />
              </Row>
              <Row label="Bestätigen" htmlFor="confirm-password">
                <Input
                  id="confirm-password"
                  type="password"
                  value={password.confirm}
                  onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                  className="h-8 text-xs"
                />
              </Row>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy === 'password' || !password.next}
                  className="h-8 gap-1.5 text-xs"
                >
                  {busy === 'password' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Passwort ändern
                </Button>
              </div>
            </form>
          </Section>
        </TabsContent>

        <TabsContent value="notifications" className="m-0 space-y-4">
          <Section title="Benachrichtigungen" icon={Bell}>
            <Toggle
              label="Neue Tickets im Pool"
              hint="Melden, wenn ein Ticket im Pool erscheint."
              checked={settings.enableNewTicketNotifications}
              onChange={(v) => updateSettings({ enableNewTicketNotifications: v })}
            />
            <Toggle
              label="Mir zugewiesene Tickets"
              hint="Melden, wenn dir ein Ticket zugewiesen wird."
              checked={settings.enableAssignedTicketNotifications}
              onChange={(v) => updateSettings({ enableAssignedTicketNotifications: v })}
            />
            <Toggle
              label="Ton"
              hint="Zusätzlich zur Benachrichtigung einen Ton abspielen."
              checked={settings.enableSound}
              onChange={(v) => updateSettings({ enableSound: v })}
            />

            {settings.enableSound && (
              <div className="space-y-2 pt-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Volume2 className="h-3.5 w-3.5" />
                  Lautstärke — {Math.round(settings.soundVolume * 100)}%
                </Label>
                <Slider
                  value={[settings.soundVolume]}
                  onValueChange={([v]) => updateSettings({ soundVolume: v })}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Label className="text-xs">
                Aktualisierungsintervall — {settings.ticketRefreshInterval}s
              </Label>
              <Slider
                value={[settings.ticketRefreshInterval]}
                onValueChange={([v]) => updateSettings({ ticketRefreshInterval: v })}
                min={10}
                max={300}
                step={10}
              />
              {/* Worth stating: one sync now serves every window, so this is
                  the app's total polling rate, not per-window. */}
              <p className="text-[11px] text-muted-foreground">
                Gilt für die gesamte App — unabhängig davon, wie viele Fenster offen sind.
                Werte unter 10&nbsp;s werden serverseitig auf 10&nbsp;s angehoben.
              </p>
            </div>

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void requestNotificationPermission()}
              >
                Systemberechtigung anfordern
              </Button>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="mail" className="m-0">
          <Section title="E-Mail-Benachrichtigungen" icon={Mail}>
            <Toggle
              label="Neues Ticket im Pool"
              checked={mail.new_ticket_pool_mail}
              onChange={(v) => void setMailSetting('new_ticket_pool_mail', MAIL_TYPES.pool, v)}
            />
            <Toggle
              label="Hilfeanfragen"
              checked={mail.new_help_mail}
              onChange={(v) => void setMailSetting('new_help_mail', MAIL_TYPES.help, v)}
            />
            <Toggle
              label="Neue Nachrichten"
              checked={mail.new_message_mail}
              onChange={(v) => void setMailSetting('new_message_mail', MAIL_TYPES.message, v)}
            />
            <Toggle
              label="Weitergeleitete Tickets"
              checked={mail.new_forward_mail}
              onChange={(v) => void setMailSetting('new_forward_mail', MAIL_TYPES.forward, v)}
            />
          </Section>
        </TabsContent>

        <TabsContent value="about" className="m-0">
          <Section title="Über" icon={Info}>
            <Row label="Version">
              <span className="font-mono text-xs tabular-nums">{currentVersion || '—'}</span>
            </Row>
            <Row label="Letzte Prüfung">
              <span className="text-xs text-muted-foreground">
                {lastCheckTime ? lastCheckTime.toLocaleString() : 'noch nie'}
              </span>
            </Row>

            {lastError && (
              <p className="rounded-md bg-tone-danger-soft px-2 py-1.5 text-xs text-tone-danger">
                {lastError}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void checkForUpdate()}
                disabled={isCheckingForUpdate}
                className="h-8 gap-1.5 text-xs"
              >
                {isCheckingForUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Auf Updates prüfen
              </Button>
              {!isCheckingForUpdate && !lastError && lastCheckTime && (
                <span className="flex items-center gap-1 text-xs text-tone-success">
                  <CheckCircle className="h-3.5 w-3.5" /> Aktuell
                </span>
              )}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </Card>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-1.5 sm:grid-cols-[160px_minmax(0,320px)] sm:gap-3">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
