import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import type { Permission } from '../permissions';
import { $resolvedScopes, $user } from '../stores/user';

export const useHasScope = (...scopes: Permission[]): boolean => {
  const user = useStore($user);
  const resolved = useStore($resolvedScopes);
  if (user?.isOwner) return true;
  if (scopes.length === 0) return true;
  return scopes.every(s => resolved[s]);
};

export const useHasAnyScope = (...scopes: Permission[]): boolean => {
  const user = useStore($user);
  const resolved = useStore($resolvedScopes);
  if (user?.isOwner) return true;
  if (scopes.length === 0) return true;
  return scopes.some(s => resolved[s]);
};

export const useRequireScope = (scope: Permission): boolean => {
  const user = useStore($user);
  const allowed = useHasScope(scope);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user && !allowed) navigate('/');
  }, [user, allowed]);
  return allowed;
};
