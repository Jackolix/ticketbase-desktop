import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Company, Location, User, Template } from '@/types/api';
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
  Image as ImageIcon
} from 'lucide-react';

export function NewTicketForm() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    description: '',
    priority: 'HIGH',
    company_id: '',
    location_id: '',
    for_user_id: '',
    template_id: '',
    attachments: [] as File[]
  });
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState('');

  const companyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (formData.company_id) {
      fetchLocations(parseInt(formData.company_id));
      fetchTemplates(parseInt(formData.company_id));
    } else {
      setLocations([]);
      setUsers([]);
    }
  }, [formData.company_id]);

  useEffect(() => {
    if (formData.location_id) {
      fetchLocationUsers(parseInt(formData.location_id));
    } else {
      setUsers([]);
    }
  }, [formData.location_id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [companiesResponse, templatesResponse] = await Promise.all([
        apiClient.getCustomers(),
        apiClient.getTemplates()
      ]);

      if (companiesResponse.status === 'success' && 'customers' in companiesResponse) {
        setCompanies(companiesResponse.customers as Company[]);
      }

      if (templatesResponse.status === 'success' && templatesResponse.data) {
        setTemplates(templatesResponse.data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      if (error instanceof Error) {
        setError(`Failed to load form data: ${error.message}. Please refresh the page.`);
      } else {
        setError('Failed to load form data. Please refresh the page.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLocations = async (companyId: number) => {
    try {
      const response = await apiClient.getCustomerLocations(companyId);
      if (response.status === 'success' && response.data) {
        setLocations(response.data.locations);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    }
  };

  const fetchLocationUsers = async (locationId: number) => {
    try {
      const response = await apiClient.getLocationUsers(locationId);
      if (response.status === 'success' && response.data) {
        setUsers(response.data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchTemplates = async (companyId: number) => {
    try {
      const response = await apiClient.getTemplates(companyId);
      if (response.status === 'success' && response.data) {
        setTemplates(response.data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
    setSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newFiles]
      }));
    }
  };

  const removeAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleCompanySelect = (company: Company) => {
    setFormData(prev => ({
      ...prev,
      company_id: company.id.toString(),
      location_id: '', // Reset location when company changes
      for_user_id: ''  // Reset user when company changes
    }));
    setCompanySearchTerm(company.name);
    setShowCompanyDropdown(false);
    setError('');
    setSuccess(false);
  };

  const handleCompanyClear = () => {
    setFormData(prev => ({
      ...prev,
      company_id: '',
      location_id: '',
      for_user_id: ''
    }));
    setCompanySearchTerm('');
    setShowCompanyDropdown(false);
    setLocations([]);
    setUsers([]);
  };

  // Memoized filtered companies to prevent unnecessary re-filtering
  const filteredCompanies = useMemo(() =>
    companies.filter(company =>
      company.name.toLowerCase().includes(companySearchTerm.toLowerCase()) ||
      company.number?.toLowerCase().includes(companySearchTerm.toLowerCase())
    ),
    [companies, companySearchTerm]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    // Validate required fields
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    if (formData.description.trim().length < 3) {
      setError('Description must be at least 3 characters long');
      return;
    }

    if (formData.description.trim().length > 1000) {
      setError('Description must be less than 1000 characters');
      return;
    }

    if (!formData.company_id) {
      setError('Please select a company');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Ensure all IDs are properly converted to numbers
      const locationId = formData.location_id 
        ? parseInt(formData.location_id) 
        : (typeof user.location_id === 'number' ? user.location_id : parseInt(String(user.location_id)));
      
      const forUserId = formData.for_user_id 
        ? parseInt(formData.for_user_id) 
        : user.id;

      const ticketData = {
        user_id: user.id,
        description: formData.description,
        priority: formData.priority,
        company_id: parseInt(formData.company_id),
        location_id: locationId,
        for_user_id: forUserId,
        dyn_template_id: formData.template_id ? parseInt(formData.template_id) : undefined,
        attachments: formData.attachments.length > 0 ? formData.attachments : undefined,
      };

      console.log('Submitting ticket data:', {
        ...ticketData,
        attachments: ticketData.attachments ? `${ticketData.attachments.length} file(s)` : 'none'
      });

      const response = await apiClient.createTicket(ticketData);
      
      if (response.status === 'success') {
        setSuccess(true);
        const companyName = companies.find(c => c.id.toString() === formData.company_id)?.name || 'the company';
        const priorityLabel = formData.priority === 'VERY_HIGH' ? 'High (8 hours)' : 
                              formData.priority === 'HIGH' ? 'Medium (2 days)' : 'Low (4 days)';
        const attachmentInfo = formData.attachments.length > 0 
          ? ` with ${formData.attachments.length} attachment${formData.attachments.length > 1 ? 's' : ''}`
          : '';
        
        setSuccessMessage(
          `Ticket created successfully for ${companyName} with ${priorityLabel} priority${attachmentInfo}. ` +
          `It will be assigned to a technician soon.`
        );
        
        // Reset form
        setFormData({
          description: '',
          priority: 'HIGH',
          company_id: '',
          location_id: '',
          for_user_id: '',
          template_id: '',
          attachments: []
        });
        setCompanySearchTerm('');
        setLocations([]);
        setUsers([]);
        
        // Auto-hide success message after 10 seconds
        setTimeout(() => {
          setSuccess(false);
          setSuccessMessage('');
        }, 10000);
      } else {
        setError(response.message || 'Failed to create ticket');
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          setError('Authentication error. Please log in again.');
        } else if (error.message.includes('400')) {
          setError('Invalid ticket data. Please check all fields and try again.');
        } else if (error.message.includes('500')) {
          setError('Server error. Please try again later or contact support.');
        } else if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
          setError('Network error. Please check your internet connection and try again.');
        } else {
          setError(`Failed to create ticket: ${error.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Create New Ticket</h1>
          <p className="text-muted-foreground">Loading form data...</p>
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Create New Ticket</h1>
        <p className="text-muted-foreground">
          Fill out the form below to create a new support ticket.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            New Ticket Details
          </CardTitle>
          <CardDescription>
            Provide as much detail as possible to help resolve your issue quickly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50 text-green-900">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description *</Label>
                <span className="text-xs text-muted-foreground">
                  {formData.description.length} / 1000 characters
                </span>
              </div>
              <Textarea
                id="description"
                placeholder="Describe the issue or request in detail..."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="min-h-[100px]"
                disabled={isSubmitting}
                maxLength={1000}
              />
              {formData.description.length > 0 && formData.description.length < 3 && (
                <p className="text-xs text-destructive">Minimum 3 characters required</p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => handleInputChange('priority', value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Low (4 days)</SelectItem>
                  <SelectItem value="HIGH">Medium (2 days)</SelectItem>
                  <SelectItem value="VERY_HIGH">High (8 hours)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Company *
              </Label>
              <div className="relative" ref={companyDropdownRef}>
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  placeholder="Search companies..."
                  value={companySearchTerm}
                  onChange={(e) => {
                    setCompanySearchTerm(e.target.value);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  className="pl-10 pr-8"
                  style={{ paddingLeft: '2.75rem' }}
                  disabled={isSubmitting}
                />
                {formData.company_id && (
                  <button
                    onClick={handleCompanyClear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                    type="button"
                  >
                    ×
                  </button>
                )}
                {showCompanyDropdown && filteredCompanies.length > 0 && (
                  <Card className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto z-50 shadow-lg">
                    <CardContent className="p-0">
                      {filteredCompanies.slice(0, 10).map((company) => (
                        <button
                          key={company.id}
                          onClick={() => handleCompanySelect(company)}
                          className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground border-b last:border-b-0 transition-colors"
                          type="button"
                        >
                          <div className="font-medium">{company.name}</div>
                          {company.number && (
                            <div className="text-sm text-muted-foreground">#{company.number}</div>
                          )}
                        </button>
                      ))}
                      {filteredCompanies.length > 10 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground border-t">
                          {filteredCompanies.length - 10} more companies...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Location */}
            {locations.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </Label>
                <Select 
                  value={formData.location_id} 
                  onValueChange={(value) => handleInputChange('location_id', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id.toString()}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* User */}
            {users.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Assign to User
                </Label>
                <Select 
                  value={formData.for_user_id} 
                  onValueChange={(value) => handleInputChange('for_user_id', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Template */}
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>Template</Label>
                <Select 
                  value={formData.template_id} 
                  onValueChange={(value) => handleInputChange('template_id', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="attachments" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Attachments
              </Label>
              <div className="space-y-2">
                <Input
                  id="attachments"
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*"
                  multiple
                  disabled={isSubmitting}
                  className="cursor-pointer"
                />
                {formData.attachments.length > 0 && (
                  <div className="space-y-2">
                    {formData.attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
                      >
                        <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormData({
                    description: '',
                    priority: 'HIGH',
                    company_id: '',
                    location_id: '',
                    for_user_id: '',
                    template_id: '',
                    attachments: []
                  });
                  setCompanySearchTerm('');
                  setLocations([]);
                  setUsers([]);
                  setError('');
                  setSuccess(false);
                }}
                disabled={isSubmitting}
              >
                Clear Form
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Ticket...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Ticket
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