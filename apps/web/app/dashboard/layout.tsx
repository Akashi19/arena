import { requireMe } from '@/lib/session';
import { DashboardNav } from './nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe('/dashboard');
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardNav isOrganizer={!!me.organizerProfile} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
