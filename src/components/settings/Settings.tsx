import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import { apiClient } from '@/lib/api';
import { openWebUIClient } from '@/lib/openwebui';
import type { OpenWebUISettings } from '@/types/openwebui';
import { 
  User, 
  Mail, 
  Lock, 
  Bell,
  Info,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Brain
} from 'lucide-react';

export function Settings() {
  const { user } = useAuth();
  const { currentVersion, isCheckingForUpdate, checkForUpdate, lastError, clearError, lastCheckTime, debugInfo } = useUpdater();
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    phone: user?.phone || ''
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [mailSettings, setMailSettings] = useState({
    new_ticket_pool_mail: false,
    new_help_mail: false,
    new_message_mail: false,
    new_forward_mail: false
  });
  const [aiSettings, setAiSettings] = useState<OpenWebUISettings>({
    baseUrl: '',
    apiKey: '',
    defaultModel: 'llama3.1',
    enabled: false
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [isLoadingMail, setIsLoadingMail] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchMailSettings();
    loadAiSettings();
  }, [user]);

  const loadAiSettings = () => {
    const settings = openWebUIClient.getSettings();
    if (settings) {
      setAiSettings(settings);
    }
  };

  const fetchMailSettings = async () => {
    if (!user) return;
    
    try {
      const response = await apiClient.getUsersMailSettings(user.id);
      if (response.status === 'success' && response.data) {
        setMailSettings({
          new_ticket_pool_mail: response.data.user_mail_settings_arr.new_ticket_pool_mail,
          new_help_mail: response.data.user_mail_settings_arr.new_help_mail,
          new_message_mail: response.data.user_mail_settings_arr.new_message_mail,
          new_forward_mail: response.data.user_mail_settings_arr.new_forward_mail
        });
      }
    } catch (error) {
      console.error('Failed to fetch mail settings:', error);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!profileData.name.trim()) {
      setErrorMessage('Name is required');
      return;
    }

    setIsLoadingProfile(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await apiClient.editProfile(user.id, profileData.name, profileData.phone);
      if (response.status === 'success') {
        setSuccessMessage('Profile updated successfully');
      } else {
        setErrorMessage(response.message || 'Failed to update profile');
      }
    } catch (error) {
      setErrorMessage('Failed to update profile');
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!passwordData.newPassword) {
      setErrorMessage('New password is required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setIsLoadingPassword(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await apiClient.changePassword(user.id, passwordData.newPassword);
      if (response.status === 'success') {
        setSuccessMessage('Password updated successfully');
        setPasswordData({ newPassword: '', confirmPassword: '' });
      } else {
        setErrorMessage(response.message || 'Failed to update password');
      }
    } catch (error) {
      setErrorMessage('Failed to update password');
    } finally {
      setIsLoadingPassword(false);
    }
  };

  const handleMailSettingChange = async (type: number, value: boolean) => {
    if (!user) return;

    setIsLoadingMail(true);
    try {
      const response = await apiClient.userMailSettings(user.id, value ? 1 : 0, type);
      if (response.status === 'success') {
        setSuccessMessage('Mail settings updated');
      }
    } catch (error) {
      setErrorMessage('Failed to update mail settings');
    } finally {
      setIsLoadingMail(false);
    }
  };

  const testAiConnection = async () => {
    if (!aiSettings.baseUrl || !aiSettings.apiKey) {
      setErrorMessage('Please enter both API URL and API Key');
      return;
    }

    setIsTestingConnection(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      openWebUIClient.updateSettings(aiSettings);
      const models = await openWebUIClient.getModels();
      const modelIds = models.map(m => m.id);
      setAvailableModels(modelIds);
      
      // If current default model is not in the list, update to first available
      if (modelIds.length > 0 && !modelIds.includes(aiSettings.defaultModel)) {
        setAiSettings(prev => ({ ...prev, defaultModel: modelIds[0] }));
      }
      
      setSuccessMessage(`Connection successful! Found ${models.length} models.`);
    } catch (error) {
      setErrorMessage(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleAiSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoadingAi(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      openWebUIClient.updateSettings(aiSettings);
      setSuccessMessage('AI settings saved successfully');
    } catch (error) {
      setErrorMessage('Failed to save AI settings');
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {successMessage && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 h-11 bg-muted/50 backdrop-blur-sm">
          <TabsTrigger 
            value="profile" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger 
            value="password" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <Lock className="w-4 h-4 mr-2" />
            Password
          </TabsTrigger>
          <TabsTrigger 
            value="notifications" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger 
            value="ai" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <Brain className="w-4 h-4 mr-2" />
            AI Assistant
          </TabsTrigger>
          <TabsTrigger 
            value="about" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <Info className="w-4 h-4 mr-2" />
            About
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and contact details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter your full name"
                    disabled={isLoadingProfile}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={user?.email || ''}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed. Contact your administrator.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter your phone number"
                    disabled={isLoadingProfile}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input
                    value={user?.role.name || ''}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <Button type="submit" disabled={isLoadingProfile}>
                  {isLoadingProfile ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Profile'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                    disabled={isLoadingPassword}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                    disabled={isLoadingPassword}
                  />
                </div>

                <Button type="submit" disabled={isLoadingPassword || !passwordData.newPassword || !passwordData.confirmPassword}>
                  {isLoadingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Configure when you want to receive email notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Tickets in Pool</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new tickets are added to your pool
                  </p>
                </div>
                <Switch
                  checked={mailSettings.new_ticket_pool_mail}
                  onCheckedChange={(checked) => {
                    setMailSettings(prev => ({ ...prev, new_ticket_pool_mail: checked }));
                    handleMailSettingChange(2, checked);
                  }}
                  disabled={isLoadingMail}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Help Requests</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when someone requests help
                  </p>
                </div>
                <Switch
                  checked={mailSettings.new_help_mail}
                  onCheckedChange={(checked) => {
                    setMailSettings(prev => ({ ...prev, new_help_mail: checked }));
                    handleMailSettingChange(3, checked);
                  }}
                  disabled={isLoadingMail}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Messages</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about new messages in tickets
                  </p>
                </div>
                <Switch
                  checked={mailSettings.new_message_mail}
                  onCheckedChange={(checked) => {
                    setMailSettings(prev => ({ ...prev, new_message_mail: checked }));
                    handleMailSettingChange(4, checked);
                  }}
                  disabled={isLoadingMail}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Forwarded Tickets</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when tickets are forwarded to you
                  </p>
                </div>
                <Switch
                  checked={mailSettings.new_forward_mail}
                  onCheckedChange={(checked) => {
                    setMailSettings(prev => ({ ...prev, new_forward_mail: checked }));
                    handleMailSettingChange(5, checked);
                  }}
                  disabled={isLoadingMail}
                />
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={() => {
                    const allEnabled = true;
                    setMailSettings({
                      new_ticket_pool_mail: allEnabled,
                      new_help_mail: allEnabled,
                      new_message_mail: allEnabled,
                      new_forward_mail: allEnabled
                    });
                    handleMailSettingChange(1, allEnabled);
                  }}
                  variant="outline"
                  disabled={isLoadingMail}
                >
                  Enable All Notifications
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Assistant
              </CardTitle>
              <CardDescription>
                Configure your OpenWebUI connection for AI-powered features like ticket summarization and response suggestions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAiSettingsSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aiUrl">OpenWebUI API URL</Label>
                  <Input
                    id="aiUrl"
                    type="url"
                    value={aiSettings.baseUrl}
                    onChange={(e) => setAiSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="https://your-openwebui.com/api/v1"
                    disabled={isLoadingAi}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your OpenWebUI instance URL (e.g., https://openwebui.example.com/api/v1)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aiKey">API Key</Label>
                  <Input
                    id="aiKey"
                    type="password"
                    value={aiSettings.apiKey}
                    onChange={(e) => setAiSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Your API key"
                    disabled={isLoadingAi}
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from your OpenWebUI Settings → Account
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testAiConnection}
                    disabled={isTestingConnection || !aiSettings.baseUrl || !aiSettings.apiKey}
                  >
                    {isTestingConnection ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                </div>

                {availableModels.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="defaultModel">Default Model</Label>
                    <select
                      id="defaultModel"
                      value={aiSettings.defaultModel}
                      onChange={(e) => setAiSettings(prev => ({ ...prev, defaultModel: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isLoadingAi}
                    >
                      {availableModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="aiEnabled"
                    checked={aiSettings.enabled}
                    onCheckedChange={(checked) => setAiSettings(prev => ({ ...prev, enabled: checked }))}
                    disabled={isLoadingAi}
                  />
                  <Label htmlFor="aiEnabled">Enable AI Assistant</Label>
                </div>

                <Button type="submit" disabled={isLoadingAi}>
                  {isLoadingAi ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save AI Settings'
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium mb-2">AI Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Automatic ticket summarization</li>
                  <li>• Smart priority and category suggestions</li>
                  <li>• AI-powered response suggestions</li>
                  <li>• Intelligent ticket categorization</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                About
              </CardTitle>
              <CardDescription>
                Application information and updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Current Version</Label>
                    <p className="text-2xl font-semibold text-primary">
                      {currentVersion || 'Loading...'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-medium">Update Management</Label>
                  <p className="text-sm text-muted-foreground">
                    The application automatically checks for updates every 30 minutes. When an update is available, you'll see a notification in the bottom-right corner.
                  </p>
                  
                  {lastCheckTime && (
                    <p className="text-xs text-muted-foreground">
                      Last checked: {lastCheckTime.toLocaleString()}
                    </p>
                  )}
                  
                  {debugInfo && (
                    <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                      Status: {debugInfo}
                    </div>
                  )}
                  <Button
                    onClick={checkForUpdate}
                    disabled={isCheckingForUpdate}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {isCheckingForUpdate ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Check for Updates
                      </>
                    )}
                  </Button>

                  {lastError && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="flex items-center justify-between">
                        <span>{lastError}</span>
                        <Button
                          onClick={clearError}
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 ml-2"
                        >
                          Dismiss
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="space-y-2">
                    <Label className="text-base font-medium">Application Info</Label>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Name:</strong> Ticketbase Desktop</p>
                      <p><strong>Built with:</strong> Tauri + React + TypeScript</p>
                      <p><strong>Update Source:</strong> GitHub Releases</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}