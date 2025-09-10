import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Loader2
} from 'lucide-react';

export function NewTicketForm() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    description: '',
    priority: 'Medium',
    company_id: '',
    location_id: '',
    for_user_id: '',
    template_id: ''
  });
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [companiesResponse, templatesResponse] = await Promise.all([
        apiClient.getCustomers(),
        apiClient.getTemplates()
      ]);

      if (companiesResponse.status === 'success' && companiesResponse.data) {
        setCompanies(companiesResponse.data.customers);
      }

      if (templatesResponse.status === 'success' && templatesResponse.data) {
        setTemplates(templatesResponse.data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      setError('Failed to load form data');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    // Validate required fields
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    if (!formData.company_id) {
      setError('Please select a company');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const ticketData = {
        user_id: user.id,
        description: formData.description,
        priority: formData.priority,
        company_id: parseInt(formData.company_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : undefined,
        for_user_id: formData.for_user_id ? parseInt(formData.for_user_id) : undefined,
        dyn_template_id: formData.template_id ? parseInt(formData.template_id) : undefined,
      };

      const response = await apiClient.createTicket(ticketData);
      
      if (response.status === 'success') {
        setSuccess(true);
        // Reset form
        setFormData({
          description: '',
          priority: 'Medium',
          company_id: '',
          location_id: '',
          for_user_id: '',
          template_id: ''
        });
        setLocations([]);
        setUsers([]);
      } else {
        setError(response.message || 'Failed to create ticket');
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
      setError('Failed to create ticket. Please try again.');
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
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Ticket created successfully! It will be assigned to a technician soon.
                </AlertDescription>
              </Alert>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue or request in detail..."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="min-h-[100px]"
                disabled={isSubmitting}
              />
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
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Company *
              </Label>
              <Select 
                value={formData.company_id} 
                onValueChange={(value) => handleInputChange('company_id', value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormData({
                    description: '',
                    priority: 'Medium',
                    company_id: '',
                    location_id: '',
                    for_user_id: '',
                    template_id: ''
                  });
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