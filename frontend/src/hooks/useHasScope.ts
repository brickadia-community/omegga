import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import type { Domain, Permission } from '../permissions';
import { $resolvedScopes, $user } from '../stores/user';

export const useHasScope = (...scopes: Permission[]): boolean => {
  const user = useStore($user);
  const resolved = useStore($resolvedScopes);
  if (user?.isOwner) return true;
  return scopes.every(s => resolved[s]);
};

export const useHasAnyScope = (prefix?: Domain): boolean => {
  const user = useStore($user);
  const resolved = useStore($resolvedScopes);
  if (!prefix) return true;
  if (user?.isOwner) return true;
  return Object.entries(resolved).some(
    ([k, v]) => k.startsWith(prefix + '.') && v,
  );
};

export const useRequireDomain = (domain: Domain): boolean => {
  const user = useStore($user);
  const allowed = useHasAnyScope(domain);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user && !allowed) navigate('/');
  }, [user, allowed]);
  return allowed;
};
