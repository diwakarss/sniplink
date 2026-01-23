import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Link2, Users, Link } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: 'URLs',
    href: '/urls',
    icon: <Link2 className="h-5 w-5" />,
  },
  {
    label: 'Users',
    href: '/users',
    icon: <Users className="h-5 w-5" />,
  },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-50">
      <div className="flex flex-col flex-grow bg-card border-r overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b">
          <Link className="h-6 w-6 text-primary" />
          <span className="ml-2 text-lg font-semibold">URL Shortener</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
