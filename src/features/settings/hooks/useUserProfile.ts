import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { ExtendedUser } from '@/shared/types/user';

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

  return {
    // Required fields from Better Auth
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    createdAt,
    updatedAt,
    
    // Optional fields from Better Auth
    image: authUser.image || null,
    practiceId: authUser.practiceId || null,
    role: authUser.role || null,
    phone: authUser.phone || null,
    
    // Profile Information - defaults for fields not in Better Auth
    bio: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    addressCountry: null,
    secondaryPhone: null,
    preferredContactMethod: null,
    
    // App Preferences - sensible defaults
    theme: 'system',
    accentColor: 'blue',
    fontSize: 'medium',
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    
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
  practiceId?: string | null;
  role?: string | null;
  phone?: string | null;
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
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  secondaryPhone?: string;
  preferredContactMethod?: string;
  // App Preferences
  theme?: string;
  accentColor?: string;
  fontSize?: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
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

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // No authentication required - return null profile
      setProfile(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch profile';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data: UserProfileInput) => {
    try {
      setError(null);

      // For now, just update the local state
      // TODO: Implement proper profile updates using Better Auth's built-in endpoints
      // TODO: Integrate PIIEncryptionService to encrypt PII fields (secondaryPhone, addressStreet, etc.)
      // TODO: Add PII access audit logging via PIIEncryptionService.logPIIAccess()
      setProfile(prev => prev ? { ...prev, ...data } : null);
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
    await fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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
