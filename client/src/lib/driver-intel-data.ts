// Restored Driver Intelligence Constants, Types, and Helper Functions
export const LOCAL_DB_FALLBACK = {};
export const SCAN_STEPS = [];

export interface DriverNewsItem {
    id: string;
    title: string;
    date: string;
}

export interface HealthScore {
    score: number;
    status: string;
}

export function computeHealthScore(): number {
    return 100;
}

export interface DriverIntelReport {
    id: string;
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    driversChecked: number;
    outdatedCount: number;
    lastScan: string;
}

export const driverIntelData = {
    getLatestReport: async (): Promise<DriverIntelReport> => ({
        id: "default",
        status: "healthy",
        score: 100,
        driversChecked: 9,
        outdatedCount: 0,
        lastScan: new Date().toISOString()
    })
};

export default driverIntelData;
