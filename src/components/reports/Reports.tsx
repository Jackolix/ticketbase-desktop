import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { 
  Calendar,
  BarChart3,
  Download,
  Loader2,
  TrendingUp,
  Users,
  Star,
  AlertCircle
} from 'lucide-react';

interface ReportData {
  report: any[];
  result: string;
  'average note'?: number;
}

interface TopUser {
  id: number;
  name: string;
  total_points: number;
}

export function Reports() {
  const [report4Data, setReport4Data] = useState<ReportData | null>(null);
  const [report5Data, setReport5Data] = useState<ReportData | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [isLoadingReport4, setIsLoadingReport4] = useState(false);
  const [isLoadingReport5, setIsLoadingReport5] = useState(false);
  const [isLoadingTopUsers, setIsLoadingTopUsers] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState<string | null>(null);

  // Set default dates to current month
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  }, []);

  const generateReport4 = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    setIsLoadingReport4(true);
    setError(null);
    
    try {
      const response = await apiClient.getReport4(startDate, endDate);
      if (response.result === 'success' && 'report' in response) {
        setReport4Data({ 
          report: response.report as any[], 
          result: response.result,
          'average note': (response as any)['average note']
        });
      } else {
        setError('Failed to generate Report 4');
      }
    } catch (error) {
      console.error('Failed to generate Report 4:', error);
      setError('Failed to generate Report 4');
    } finally {
      setIsLoadingReport4(false);
    }
  };

  const generateReport5 = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    setIsLoadingReport5(true);
    setError(null);
    
    try {
      const response = await apiClient.getReport5(startDate, endDate);
      if (response.result === 'success' && 'report' in response) {
        setReport5Data({ 
          report: response.report as any[], 
          result: response.result 
        });
      } else {
        setError('Failed to generate Report 5');
      }
    } catch (error) {
      console.error('Failed to generate Report 5:', error);
      setError('Failed to generate Report 5');
    } finally {
      setIsLoadingReport5(false);
    }
  };

  const generateTopUsers = async () => {
    setIsLoadingTopUsers(true);
    setError(null);
    
    try {
      const response = await apiClient.getTopUsers(selectedMonth);
      if (response.result === 'success' && 'top_users' in response) {
        setTopUsers(response.top_users as TopUser[]);
      } else {
        setError('Failed to load top users');
      }
    } catch (error) {
      console.error('Failed to load top users:', error);
      setError('Failed to load top users');
    } finally {
      setIsLoadingTopUsers(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and view system reports</p>
        </div>
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Start Date
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                End Date
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="report4" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="report4">Customer Reviews</TabsTrigger>
          <TabsTrigger value="report5">Technician Statistics</TabsTrigger>
          <TabsTrigger value="topusers">Top Users</TabsTrigger>
        </TabsList>

        <TabsContent value="report4" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Customer Review Report
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                List of technicians and their tickets that have been reviewed by customers
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Button 
                  onClick={generateReport4} 
                  disabled={isLoadingReport4}
                  className="flex items-center gap-2"
                >
                  {isLoadingReport4 ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  Generate Report
                </Button>
                {report4Data && (
                  <Button
                    variant="outline"
                    onClick={() => exportToCSV(report4Data.report, 'customer_review_report')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                )}
              </div>

              {report4Data && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {report4Data.report.length - 1} reviews found
                    </span>
                    {(report4Data.report as any)['average note'] && (
                      <Badge variant="outline">
                        Average Rating: {(report4Data.report as any)['average note']}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="border rounded-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b">
                          <tr>
                            <th className="text-left p-3 font-medium">Technician</th>
                            <th className="text-left p-3 font-medium">Ticket ID</th>
                            <th className="text-left p-3 font-medium">Customer</th>
                            <th className="text-left p-3 font-medium">Rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report4Data.report.filter(row => typeof row === 'object' && row.Techniker).map((row, index) => (
                            <tr key={index} className="border-b last:border-b-0">
                              <td className="p-3">{row.Techniker || 'N/A'}</td>
                              <td className="p-3">#{row['Ticket-ID'] || 'N/A'}</td>
                              <td className="p-3">{row.Kunde || 'N/A'}</td>
                              <td className="p-3">
                                <Badge variant={
                                  row.Note >= 4 ? 'default' : 
                                  row.Note >= 2 ? 'secondary' : 'destructive'
                                }>
                                  {row.Note || 'N/A'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report5" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Technician Statistics Report
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Overview of all tickets, closed tickets, reopened tickets and reviewed tickets by technician
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Button 
                  onClick={generateReport5} 
                  disabled={isLoadingReport5}
                  className="flex items-center gap-2"
                >
                  {isLoadingReport5 ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  Generate Report
                </Button>
                {report5Data && (
                  <Button
                    variant="outline"
                    onClick={() => exportToCSV(report5Data.report, 'technician_statistics_report')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                )}
              </div>

              {report5Data && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    {report5Data.report.length} technicians found
                  </div>
                  
                  <div className="border rounded-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b">
                          <tr>
                            <th className="text-left p-3 font-medium">Technician</th>
                            <th className="text-right p-3 font-medium">All Tickets</th>
                            <th className="text-right p-3 font-medium">Closed</th>
                            <th className="text-right p-3 font-medium">Reopened</th>
                            <th className="text-right p-3 font-medium">Reviewed</th>
                            <th className="text-right p-3 font-medium">Reopen %</th>
                            <th className="text-right p-3 font-medium">Review %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report5Data.report.map((row, index) => (
                            <tr key={index} className="border-b last:border-b-0">
                              <td className="p-3 font-medium">{row.Techniker || 'N/A'}</td>
                              <td className="text-right p-3">{row['All tickets'] || 0}</td>
                              <td className="text-right p-3">{row['All closed tickets'] || 0}</td>
                              <td className="text-right p-3">{row['All reopened tickets'] || 0}</td>
                              <td className="text-right p-3">{row['All reviewed tickets'] || 0}</td>
                              <td className="text-right p-3">
                                <Badge variant={
                                  parseFloat(row['Percentage 1']) > 20 ? 'destructive' :
                                  parseFloat(row['Percentage 1']) > 10 ? 'secondary' : 'default'
                                }>
                                  {row['Percentage 1'] || '0%'}
                                </Badge>
                              </td>
                              <td className="text-right p-3">
                                <Badge variant="outline">
                                  {row['Percentage 2'] || '0%'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topusers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top 5 Users by Month
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Highest performing users based on monthly points
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="space-y-2">
                  <Label htmlFor="month-select">Select Month</Label>
                  <Select 
                    value={selectedMonth.toString()} 
                    onValueChange={(value) => setSelectedMonth(parseInt(value))}
                  >
                    <SelectTrigger id="month-select" className="w-[180px]">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={generateTopUsers} 
                    disabled={isLoadingTopUsers}
                    className="flex items-center gap-2"
                  >
                    {isLoadingTopUsers ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    Load Top Users
                  </Button>
                </div>
                {topUsers.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportToCSV(topUsers, 'top_users_report')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                )}
              </div>

              {topUsers.length > 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Top {topUsers.length} users for {months.find(m => m.value === selectedMonth)?.label}
                  </div>
                  
                  <div className="grid gap-3">
                    {topUsers.map((user, index) => (
                      <Card key={user.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-muted-foreground">ID: {user.id}</div>
                            </div>
                          </div>
                          <Badge variant="default" className="ml-auto">
                            {user.total_points} points
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}