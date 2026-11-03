'use client';
import { BusinessGate } from '@/components/business-gate';
import { NotificationsWorkspace } from '@/components/attendance-notifications';
export default function Page() { return <BusinessGate>{business => <NotificationsWorkspace business={business} />}</BusinessGate>; }
