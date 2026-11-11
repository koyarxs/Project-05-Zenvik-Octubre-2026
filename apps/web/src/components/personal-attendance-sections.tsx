'use client';
import { usePersonalBusiness } from './personal-attendance-shell';
import { IncidentsWorkspace } from './incidents-workspace';
import { NotificationsWorkspace } from './attendance-notifications';
import { LeaveWorkspace } from './leaves/leave-workspace';

export function PersonalAttendanceSection({ section }: { section: 'incidents' | 'leaves' | 'notifications' }) {
  const business = usePersonalBusiness();
  return <div className="attendance-secondary-page">{section === 'incidents' ? <IncidentsWorkspace business={business} personal /> : section === 'leaves' ? <LeaveWorkspace business={business} personal /> : <NotificationsWorkspace business={business} personal />}</div>;
}
