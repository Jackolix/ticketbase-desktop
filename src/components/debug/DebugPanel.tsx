import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { useTickets } from '@/contexts/TicketsContext';
import {
  Activity,
  Database,
  Clock,
  MemoryStick,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  Trash2
} from 'lucide-react';

interface DebugPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export function DebugPanel({ isVisible, onClose }: DebugPanelProps) {
  const [stats, setStats] = useState(performanceMonitor.getStats());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { filterState, allTicketsForSearch, tickets, customers } = useTickets();

  // Refresh stats every 2 seconds
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setStats(performanceMonitor.getStats());
    }, 2000);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateDataSize = (data: any): number => {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 0;
    }
  };

  const contextDataSizes = {
    tickets: calculateDataSize(tickets),
    allTicketsForSearch: calculateDataSize(allTicketsForSearch),
    customers: calculateDataSize(customers),
    filterState: calculateDataSize(filterState)
  };

  const totalContextSize = Object.values(contextDataSizes).reduce((a, b) => a + b, 0);

  const sessionStorageUsage = (() => {
    try {
      let total = 0;
      for (let key in sessionStorage) {
        if (sessionStorage.hasOwnProperty(key)) {
          total += sessionStorage[key].length + key.length;
        }
      }
      return total;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-h-[80vh] overflow-hidden">
      <Card className="bg-background/95 backdrop-blur border-2 border-primary/20 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Debug Panel</CardTitle>
              <Badge variant="secondary" className="text-xs">DEV</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="h-6 w-6 p-0"
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  performanceMonitor.clear();
                  setStats(performanceMonitor.getStats());
                }}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isCollapsed && (
          <CardContent className="pt-0 max-h-[70vh] overflow-y-auto">
            <Tabs defaultValue="cache" className="w-full">
              <TabsList className="grid w-full grid-cols-4 text-xs">
                <TabsTrigger value="cache" className="text-xs">
                  <Database className="h-3 w-3 mr-1" />
                  Cache
                </TabsTrigger>
                <TabsTrigger value="performance" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Perf
                </TabsTrigger>
                <TabsTrigger value="memory" className="text-xs">
                  <MemoryStick className="h-3 w-3 mr-1" />
                  Memory
                </TabsTrigger>
                <TabsTrigger value="context" className="text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  State
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cache" className="mt-3 space-y-2">
                <div className="text-xs font-medium mb-2">Cache Statistics</div>
                {Object.entries(stats.cacheStats).map(([key, stat]) => {
                  const total = stat.hits + stat.misses;
                  const hitRate = total > 0 ? (stat.hits / total * 100).toFixed(1) : '0';
                  const hitRateColor = parseFloat(hitRate) > 80 ? 'text-green-600' : parseFloat(hitRate) > 50 ? 'text-yellow-600' : 'text-red-600';

                  return (
                    <Card key={key} className="p-2">
                      <div className="text-xs font-medium truncate" title={key}>{key}</div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-1">
                        <div>Hit Rate: <span className={hitRateColor}>{hitRate}%</span></div>
                        <div>Hits: {stat.hits} | Misses: {stat.misses}</div>
                        <div>Size: {formatBytes(stat.size)}</div>
                      </div>
                    </Card>
                  );
                })}
                {Object.keys(stats.cacheStats).length === 0 && (
                  <div className="text-xs text-muted-foreground">No cache statistics available</div>
                )}
              </TabsContent>

              <TabsContent value="performance" className="mt-3 space-y-2">
                <div className="text-xs font-medium mb-2">Performance Metrics</div>
                {Object.entries(stats.metrics).map(([label, metric]) => {
                  const duration = metric.duration || 0;
                  const durationColor = duration > 1000 ? 'text-red-600' : duration > 500 ? 'text-yellow-600' : 'text-green-600';

                  return (
                    <Card key={label} className="p-2">
                      <div className="text-xs font-medium truncate" title={label}>{label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Duration: <span className={durationColor}>{duration.toFixed(2)}ms</span>
                      </div>
                    </Card>
                  );
                })}

                <div className="text-xs font-medium mt-3 mb-2">Render Counts</div>
                {Object.entries(stats.renderCounts).map(([component, count]) => (
                  <div key={component} className="flex justify-between text-xs">
                    <span className="truncate" title={component}>{component}</span>
                    <Badge variant={count > 10 ? 'destructive' : count > 5 ? 'default' : 'secondary'} className="text-xs h-4">
                      {count}
                    </Badge>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="memory" className="mt-3 space-y-2">
                <div className="text-xs font-medium mb-2">Memory Usage</div>
                {stats.memorySnapshots.length > 0 && (
                  <div className="space-y-2">
                    {stats.memorySnapshots.slice(-5).map((snapshot, index) => (
                      <Card key={index} className="p-2">
                        <div className="text-xs">
                          <div>Time: {new Date(snapshot.timestamp).toLocaleTimeString()}</div>
                          <div>Used: {formatBytes(snapshot.usedJSHeapSize)}</div>
                          <div>Total: {formatBytes(snapshot.totalJSHeapSize)}</div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="text-xs font-medium mt-3 mb-2">Storage Usage</div>
                <Card className="p-2">
                  <div className="text-xs">
                    <div>SessionStorage: {formatBytes(sessionStorageUsage * 2)}</div>
                    <div>Context Data: {formatBytes(totalContextSize)}</div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="context" className="mt-3 space-y-2">
                <div className="text-xs font-medium mb-2">Context State</div>

                <Card className="p-2">
                  <div className="text-xs font-medium">Filter State</div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <div>Search: "{filterState.searchTerm}"</div>
                    <div>Status: {filterState.statusFilter}</div>
                    <div>Priority: {filterState.priorityFilter}</div>
                    <div>Customer: {filterState.customerFilter || 'None'}</div>
                    <div>Advanced: {filterState.showAdvancedFilters ? 'Yes' : 'No'}</div>
                    <div>Size: {formatBytes(contextDataSizes.filterState)}</div>
                  </div>
                </Card>

                <Card className="p-2">
                  <div className="text-xs font-medium">Tickets Data</div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <div>My: {tickets.my_tickets.length} tickets</div>
                    <div>New: {tickets.new_tickets.length} tickets</div>
                    <div>All: {tickets.all_tickets.length} tickets</div>
                    <div>Size: {formatBytes(contextDataSizes.tickets)}</div>
                  </div>
                </Card>

                <Card className="p-2">
                  <div className="text-xs font-medium">Advanced Search</div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <div>Loaded: {allTicketsForSearch ? 'Yes' : 'No'}</div>
                    {allTicketsForSearch && (
                      <>
                        <div>Total: {allTicketsForSearch.new_tickets.length + allTicketsForSearch.my_tickets.length + allTicketsForSearch.all_tickets.length} tickets</div>
                        <div>Size: {formatBytes(contextDataSizes.allTicketsForSearch)}</div>
                      </>
                    )}
                  </div>
                </Card>

                <Card className="p-2">
                  <div className="text-xs font-medium">Customers</div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <div>Count: {customers.length} customers</div>
                    <div>Size: {formatBytes(contextDataSizes.customers)}</div>
                  </div>
                </Card>

                <Card className="p-2">
                  <div className="text-xs font-medium">Total Context Size</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <div className="font-medium">{formatBytes(totalContextSize)}</div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>
    </div>
  );
}