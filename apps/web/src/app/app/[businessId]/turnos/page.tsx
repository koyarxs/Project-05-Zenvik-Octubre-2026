'use client';
import { BusinessGate } from '@/components/business-gate';
import { ShiftCalendar } from '@/components/shifts/shift-calendar';
export default function Page() { return <BusinessGate>{business => <ShiftCalendar key={business.id} business={business} />}</BusinessGate>; }
