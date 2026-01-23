import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">{user?.email}</span>
            <Button variant="outline" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground">
          Welcome to the admin dashboard. Layout will be added in Plan 07-04.
        </p>
      </div>
    </div>
  );
}
