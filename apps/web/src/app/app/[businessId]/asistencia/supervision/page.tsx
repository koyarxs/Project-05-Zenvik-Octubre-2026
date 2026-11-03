'use client';
import { BusinessGate } from '@/components/business-gate';
import { AttendanceSupervision } from '@/components/attendance-supervision';
export default function Page() { return <BusinessGate>{business => <AttendanceSupervision business={business} />}</BusinessGate>; }
