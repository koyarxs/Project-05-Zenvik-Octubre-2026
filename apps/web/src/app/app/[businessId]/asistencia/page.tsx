'use client';
import { BusinessGate } from '@/components/business-gate';
import { AttendanceWorkspace } from '@/components/attendance-workspace';
export default function Page() { return <BusinessGate>{business => <AttendanceWorkspace business={business} />}</BusinessGate>; }
