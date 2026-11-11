'use client';
import { BusinessGate } from '@/components/business-gate';
import { SubscriptionWorkspace } from '@/components/subscription-workspace';
export default function Page() { return <BusinessGate>{business => <SubscriptionWorkspace business={business} />}</BusinessGate>; }
