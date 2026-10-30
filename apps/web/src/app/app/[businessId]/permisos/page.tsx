'use client';
import { BusinessGate } from '@/components/business-gate';
import { LeaveWorkspace } from '@/components/leaves/leave-workspace';
export default function Page() { return <BusinessGate>{business => <LeaveWorkspace key={business.id} business={business} />}</BusinessGate>; }
