'use client';
import { BusinessWorkspaces } from '@/components/business-workspaces';
import { PlatformConsole } from '@/components/platform-console';
import { useSession } from '@/components/session-provider';

export default function Page() {
  const { user } = useSession();
  return user?.is_platform_admin ? <PlatformConsole /> : <BusinessWorkspaces />;
}
