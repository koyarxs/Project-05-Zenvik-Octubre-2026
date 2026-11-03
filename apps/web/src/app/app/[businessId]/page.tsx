'use client';
import { BusinessGate } from '@/components/business-gate';
import { WorkerDashboard } from '@/components/worker-dashboard';
import { OperationsDashboard } from '@/components/operations-dashboard';
export default function Page() { return <BusinessGate>{business => business.role === 'EMPLOYEE' ? <WorkerDashboard key={business.id} business={business} /> : <OperationsDashboard key={business.id} business={business} />}</BusinessGate>; }
