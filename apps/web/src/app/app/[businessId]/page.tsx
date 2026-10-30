'use client';
import { BusinessGate } from '@/components/business-gate';
import { OperationsDashboard } from '@/components/operations-dashboard';
export default function Page() { return <BusinessGate>{business => <OperationsDashboard key={business.id} business={business} />}</BusinessGate>; }
