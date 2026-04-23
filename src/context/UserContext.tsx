import { useAuth } from '../contexts/AuthContext';

export function useUser() {
  return useAuth();
}
