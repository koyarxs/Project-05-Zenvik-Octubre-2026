'use client';
import { BusinessGate } from '@/components/business-gate';
import { EmployeeForm } from '@/components/employee-form';
export default function Page() { return <BusinessGate>{business => <EmployeeForm business={business} />}</BusinessGate>; }
