'use client';
import { BusinessGate } from '@/components/business-gate';
import { IncidentsWorkspace } from '@/components/incidents-workspace';
export default function Page() { return <BusinessGate>{business => <IncidentsWorkspace business={business} />}</BusinessGate>; }
