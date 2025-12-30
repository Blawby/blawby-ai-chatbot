# Missing Better Auth Endpoints in Staging-API

## Endpoints Needed

### POST `/api/auth/update-user`
[Better Auth Documentation](https://www.better-auth.com/docs/reference/api/update-user)

**Missing Fields** - Add to `user.additionalFields`:

#### Onboarding
- `birthday` (string)
- `primaryUseCase` (string)
- `useCaseAdditionalInfo` (string)
- `onboardingCompleted` (boolean)

#### General Settings
- `theme` (string)
- `accentColor` (string)
- `language` (string)
- `spokenLanguage` (string)
- `timezone` (string)
- `dateFormat` (string)
- `timeFormat` (string)

#### Notifications
- `notificationResponsesPush` (boolean)
- `notificationTasksPush` (boolean)
- `notificationTasksEmail` (boolean)
- `notificationMessagingPush` (boolean)

#### Security
- `twoFactorEnabled` (boolean)
- `emailNotifications` (boolean)
- `loginAlerts` (boolean)
- `sessionTimeout` (number)

#### Account
- `selectedDomain` (string | null)
- `customDomains` (string | null)
- `receiveFeedbackEmails` (boolean)
- `marketingEmails` (boolean)
- `securityAlerts` (boolean)

### GET `/api/auth/get-session`
[Better Auth Documentation](https://www.better-auth.com/docs/concepts/session-management#get-session)

**Note**: Ensure all fields listed above are returned in the `user` object of the session response.

### POST `/api/practice/{uuid}/details`
[Staging-API Documentation](https://staging-api.blawby.com/scalar#tag/practice/POST/api/practice/{uuid}/details)

**Missing Fields**:
- `website` (string)
- `addressLine1` (string)
- `addressLine2` (string)
- `city` (string)
- `state` (string)
- `postalCode` (string)
- `country` (string)
- `primaryColor` (string)
- `accentColor` (string)
- `introMessage` (string)
- `overview` (string)
- `isPublic` (boolean)
- `services` (array)
