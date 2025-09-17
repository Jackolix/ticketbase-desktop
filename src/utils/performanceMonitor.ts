// Performance monitoring utility
class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, { start: number; end?: number; duration?: number }> = new Map();
  private cacheStats: Map<string, { hits: number; misses: number; size: number }> = new Map();
  private renderCounts: Map<string, number> = new Map();
  private memorySnapshots: Array<{ timestamp: number; usedJSHeapSize: number; totalJSHeapSize: number }> = [];

  private constructor() {
    // Take memory snapshots every 30 seconds in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        this.takeMemorySnapshot();
      }, 30000);
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Performance timing
  startTimer(label: string): void {
    this.metrics.set(label, { start: performance.now() });
    console.log(`⏱️ [PERF] Started: ${label}`);
  }

  endTimer(label: string): number {
    const metric = this.metrics.get(label);
    if (!metric) {
      console.warn(`⚠️ [PERF] Timer '${label}' not found`);
      return 0;
    }

    const end = performance.now();
    const duration = end - metric.start;

    metric.end = end;
    metric.duration = duration;

    const color = duration > 1000 ? '🔴' : duration > 500 ? '🟡' : '🟢';
    console.log(`${color} [PERF] Completed: ${label} - ${duration.toFixed(2)}ms`);

    return duration;
  }

  // Cache monitoring
  recordCacheHit(cacheKey: string, size?: number): void {
    const stats = this.cacheStats.get(cacheKey) || { hits: 0, misses: 0, size: 0 };
    stats.hits++;
    if (size !== undefined) stats.size = size;
    this.cacheStats.set(cacheKey, stats);

    console.log(`💾 [CACHE HIT] ${cacheKey} - Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)}%`);
  }

  recordCacheMiss(cacheKey: string): void {
    const stats = this.cacheStats.get(cacheKey) || { hits: 0, misses: 0, size: 0 };
    stats.misses++;
    this.cacheStats.set(cacheKey, stats);

    console.log(`❌ [CACHE MISS] ${cacheKey} - Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)}%`);
  }

  recordCacheSize(cacheKey: string, size: number, itemCount?: number): void {
    const stats = this.cacheStats.get(cacheKey) || { hits: 0, misses: 0, size: 0 };
    stats.size = size;
    this.cacheStats.set(cacheKey, stats);

    const sizeStr = this.formatBytes(size);
    const itemStr = itemCount !== undefined ? `, ${itemCount} items` : '';
    console.log(`📊 [CACHE SIZE] ${cacheKey} - ${sizeStr}${itemStr}`);
  }

  // Render tracking
  recordRender(componentName: string): void {
    const count = this.renderCounts.get(componentName) || 0;
    this.renderCounts.set(componentName, count + 1);

    if (count > 0 && count % 5 === 0) {
      console.log(`🔄 [RENDER] ${componentName} - ${count + 1} renders`);
    }
  }

  // Memory monitoring
  private takeMemorySnapshot(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const snapshot = {
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize
      };

      this.memorySnapshots.push(snapshot);

      // Keep only last 20 snapshots
      if (this.memorySnapshots.length > 20) {
        this.memorySnapshots.shift();
      }

      console.log(`🧠 [MEMORY] Used: ${this.formatBytes(snapshot.usedJSHeapSize)}, Total: ${this.formatBytes(snapshot.totalJSHeapSize)}`);
    }
  }

  // Get current stats
  getStats() {
    return {
      metrics: Object.fromEntries(this.metrics),
      cacheStats: Object.fromEntries(this.cacheStats),
      renderCounts: Object.fromEntries(this.renderCounts),
      memorySnapshots: this.memorySnapshots
    };
  }

  // Get cache summary
  getCacheSummary() {
    const summary: Record<string, { hitRate: string; size: string; hits: number; misses: number }> = {};

    for (const [key, stats] of this.cacheStats) {
      const total = stats.hits + stats.misses;
      const hitRate = total > 0 ? (stats.hits / total * 100).toFixed(1) : '0';

      summary[key] = {
        hitRate: `${hitRate}%`,
        size: this.formatBytes(stats.size),
        hits: stats.hits,
        misses: stats.misses
      };
    }

    return summary;
  }

  // Format bytes utility
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Clear all stats
  clear(): void {
    this.metrics.clear();
    this.cacheStats.clear();
    this.renderCounts.clear();
    this.memorySnapshots = [];
    console.log('🧹 [PERF] All performance stats cleared');
  }

  // Log summary
  logSummary(): void {
    console.group('📈 Performance Summary');

    console.log('⏱️ Timings:', this.metrics);
    console.log('💾 Cache Stats:', this.getCacheSummary());
    console.log('🔄 Render Counts:', this.renderCounts);

    if (this.memorySnapshots.length > 0) {
      const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
      console.log('🧠 Latest Memory:', {
        used: this.formatBytes(latest.usedJSHeapSize),
        total: this.formatBytes(latest.totalJSHeapSize)
      });
    }

    console.groupEnd();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// Hook for React components
export const usePerformanceMonitor = (componentName: string) => {
  if (process.env.NODE_ENV === 'development') {
    performanceMonitor.recordRender(componentName);
  }

  return {
    startTimer: (label: string) => performanceMonitor.startTimer(`${componentName}.${label}`),
    endTimer: (label: string) => performanceMonitor.endTimer(`${componentName}.${label}`),
    recordCacheHit: (key: string, size?: number) => performanceMonitor.recordCacheHit(`${componentName}.${key}`, size),
    recordCacheMiss: (key: string) => performanceMonitor.recordCacheMiss(`${componentName}.${key}`),
    recordCacheSize: (key: string, size: number, itemCount?: number) => performanceMonitor.recordCacheSize(`${componentName}.${key}`, size, itemCount)
  };
};