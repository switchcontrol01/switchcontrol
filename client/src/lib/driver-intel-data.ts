// Restored Driver Intelligence Types and Schema definitions
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
