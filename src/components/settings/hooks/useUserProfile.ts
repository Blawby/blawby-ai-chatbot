import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { ExtendedUser } from '../../../types/user';
import { useAuth, useSession } from '../../../contexts/AuthContext';
import { backendClient } from '../../../lib/backendClient';
import type { UpdateUserDetailsPayload } from '../../../types/backend';

// Type guard to validate Better Auth user has required fields
function _isValidBetterAuthUser(user: unknown): user is ExtendedUser {
  return (
    user !== null &&
    typeof user === 'object' &&
    'id' in user &&
    'name' in user &&
    'email' in user &&
    typeof (user as Record<string, unknown>).id === 'string' &&
    typeof (user as Record<string, unknown>).name === 'string' &&
    typeof (user as Record<string, unknown>).email === 'string' &&
    (user as Record<string, unknown>).createdAt !== undefined &&
    ((user as Record<string, unknown>).createdAt instanceof Date || 
     typeof (user as Record<string, unknown>).createdAt === 'string') &&
    (user as Record<string, unknown>).updatedAt !== undefined &&
    ((user as Record<string, unknown>).updatedAt instanceof Date || 
     typeof (user as Record<string, unknown>).updatedAt === 'string')
  );
}

// Safe mapper function to convert Better Auth user to UserProfile
function _mapBetterAuthUserToProfile(authUser: ExtendedUser): UserProfile {
  // Convert timestamps to ISO strings if they're Date objects
  const createdAt = authUser.createdAt instanceof Date 
    ? authUser.createdAt.toISOString() 
    : authUser.createdAt || new Date().toISOString();
  
  const updatedAt = authUser.updatedAt instanceof Date 
    ? authUser.updatedAt.toISOString() 
    : authUser.updatedAt || new Date().toISOString();

  const details = authUser.details ?? {};

  return {
    // Required fields from Better Auth
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    createdAt,
    updatedAt,
    
    // Optional fields from Better Auth
    image: authUser.image || null,
    organizationId: authUser.organizationId || null,
    role: authUser.role || null,
    phone: details.phone ?? authUser.phone ?? null,
    
    // Profile Information - defaults for fields not in Better Auth
    bio: null,
    addressStreet: details.addressLine1 ?? null,
    addressCity: details.city ?? null,
    addressState: details.state ?? null,
    addressZip: details.postalCode ?? null,
    addressCountry: details.country ?? null,
    secondaryPhone: authUser.secondaryPhone || null,
    preferredContactMethod: null,
    dob: details.dob ?? null,
    productUsage: details.productUsage ?? [],
    
    // App Preferences - sensible defaults
    theme: 'system',
    accentColor: 'blue',
    fontSize: 'medium',
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    
    // Notification Preferences - sensible defaults
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    notificationFrequency: 'immediate',
    
    // Chat Preferences - sensible defaults
    autoSaveConversations: true,
    typingIndicators: true,
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  organizationId?: string | null;
  role?: string | null;
  phone?: string | null;
  dob?: string | null;
  productUsage?: string[];
  // Profile Information
  bio?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  secondaryPhone?: string | null;
  preferredContactMethod?: string | null;
  // App Preferences
  theme?: string;
  accentColor?: string;
  fontSize?: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
  // Notification Preferences
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  smsNotifications?: boolean;
  notificationFrequency?: string;
  // Chat Preferences
  autoSaveConversations?: boolean;
  typingIndicators?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  // Profile Information
  name?: string;
  bio?: string;
  phone?: string;
  dob?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  secondaryPhone?: string;
  preferredContactMethod?: string;
  productUsage?: string[];
  // App Preferences
  theme?: string;
  accentColor?: string;
  fontSize?: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
  // Notification Preferences
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  smsNotifications?: boolean;
  notificationFrequency?: string;
  // Chat Preferences
  autoSaveConversations?: boolean;
  typingIndicators?: boolean;
}

export interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  updateProfile: (data: UserProfileInput) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  deleteAvatar: () => Promise<void>;
  refetch: () => Promise<void>;
}

export const useUserProfile = (): UseUserProfileReturn => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentAvatarObjectUrl = useRef<string | null>(null);
  const { data: sessionState, isPending: sessionPending } = useSession();
  const { refreshSession } = useAuth();

  const updateProfile = useCallback(async (data: UserProfileInput) => {
    try {
      setError(null);

      const payload: UpdateUserDetailsPayload = {};

      if ('phone' in data) {
        payload.phone = data.phone;
      }
      
      if ('secondaryPhone' in data) {
        payload.secondaryPhone = data.secondaryPhone;
      }

      if ('dob' in data) {
        payload.dob = data.dob ?? null;
      }

      if ('productUsage' in data) {
        payload.productUsage = data.productUsage ?? [];
      }

      if ('addressStreet' in data) {
        payload.addressLine1 = data.addressStreet ?? null;
      }

      if ('addressCity' in data) {
        payload.city = data.addressCity ?? null;
      }

      if ('addressState' in data) {
        payload.state = data.addressState ?? null;
      }

      if ('addressZip' in data) {
        payload.postalCode = data.addressZip ?? null;
      }

      if ('addressCountry' in data) {
        payload.country = data.addressCountry ?? null;
      }

      if (Object.keys(payload).length === 0) {
        return;
      }

      await backendClient.updateUserDetails(payload);
      await refreshSession();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      setError(errorMessage);
      throw err; // Re-throw so the caller can handle it
    }
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    let newAvatarUrl: string | null = null;
    
    try {
      setError(null);

      // Revoke the previous object URL if it exists
      if (currentAvatarObjectUrl.current) {
        URL.revokeObjectURL(currentAvatarObjectUrl.current);
        currentAvatarObjectUrl.current = null;
      }

      // For now, just create a local URL for the avatar
      // TODO: Implement proper avatar upload using Better Auth's built-in endpoints
      newAvatarUrl = URL.createObjectURL(file);
      currentAvatarObjectUrl.current = newAvatarUrl;
      setProfile(prev => prev ? { ...prev, image: newAvatarUrl } : null);
    } catch (err) {
      // Revoke the object URL if it was created but an error occurred
      if (newAvatarUrl) {
        URL.revokeObjectURL(newAvatarUrl);
        currentAvatarObjectUrl.current = null;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload avatar';
      setError(errorMessage);
      throw err; // Re-throw so the caller can handle it
    }
  }, []);

  const deleteAvatar = useCallback(async () => {
    try {
      setError(null);

      // Revoke the current object URL if it exists
      if (currentAvatarObjectUrl.current) {
        URL.revokeObjectURL(currentAvatarObjectUrl.current);
        currentAvatarObjectUrl.current = null;
      }

      // Check if the current profile image is an object URL and revoke it
      if (profile?.image && (profile.image.startsWith('blob:') || profile.image.startsWith('data:'))) {
        URL.revokeObjectURL(profile.image);
      }

      // For now, just remove the avatar from local state
      // TODO: Implement proper avatar deletion using Better Auth's built-in endpoints
      setProfile(prev => prev ? { ...prev, image: null } : null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete avatar';
      setError(errorMessage);
      throw err; // Re-throw so the caller can handle it
    }
  }, [profile?.image]);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      await refreshSession();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh profile';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (sessionPending) {
      setLoading(true);
      return;
    }

    const sessionUser = sessionState?.user as unknown;
    if (!sessionUser || !_isValidBetterAuthUser(sessionUser)) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(_mapBetterAuthUserToProfile(sessionUser));
    setLoading(false);
  }, [sessionPending, sessionState?.user]);

  // Cleanup object URL on component unmount
  useEffect(() => {
    return () => {
      if (currentAvatarObjectUrl.current) {
        URL.revokeObjectURL(currentAvatarObjectUrl.current);
        currentAvatarObjectUrl.current = null;
      }
    };
  }, []);

  return {
    profile,
    loading,
    error,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    refetch
  };
};
