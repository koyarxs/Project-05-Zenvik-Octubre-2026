'use client';
import { BusinessGate } from '@/components/business-gate';
import { EmployeeDetail } from '@/components/employee-detail';
export default function Page() { return <BusinessGate>{business => <EmployeeDetail business={business} edit />}</BusinessGate>; }
